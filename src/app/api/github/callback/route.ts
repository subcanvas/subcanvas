import { NextResponse, type NextRequest } from "next/server"

import { recordStep } from "@/lib/activity"
import { gitHubAppConfig, installationAccount, personCanSeeInstallation } from "@/lib/github/app"
import { CONNECT_COOKIE, decodeConnectState, sameState } from "@/lib/github/connect-state"
import { readOrgAccess } from "@/lib/org-access"
import { requestOrigin } from "@/lib/origin"
import { hasRole } from "@/lib/roles"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// Connect GitHub, step two: GitHub sends the admin back here after they
// installed the app, or changed which repositories it reads, with the
// installation's id and a code that says who they are. The workspace may use
// the installation only once all of these hold:
//
// - the value GitHub handed back is the one this browser was given in step
//   one, so the request started here and not from someone else's link;
// - they are still signed in, and still an admin of that workspace;
// - GitHub says the person behind the code can see the installation.
//
// Only then is the connection written, with the server's secret key: nobody
// can write one themselves (migration github_connections).
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request)
  const params = request.nextUrl.searchParams
  const saved = decodeConnectState(request.cookies.get(CONNECT_COOKIE)?.value)
  const config = gitHubAppConfig()

  const finish = (path: string) => {
    const response = NextResponse.redirect(`${origin}${path}`)
    response.cookies.delete({ name: CONNECT_COOKIE, path: "/api/github" })
    return response
  }
  if (!config) return new NextResponse("Not found", { status: 404 })
  // Installed from GitHub's own pages, or after the cookie ran out: there is
  // no telling which workspace it was for, so nothing is connected. Settings
  // says to start from there.
  if (!saved) return finish("/auth/home")
  let slug = saved.slug
  const settings = (outcome: string, account?: string) =>
    finish(`/${slug}/settings/github?github=${outcome}${account ? `&account=${encodeURIComponent(account)}` : ""}`)
  if (!sameState(saved.state, params.get("state"))) return settings("expired")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return finish(`/login?next=${encodeURIComponent(`/${slug}/settings/github`)}`)
  const access = await readOrgAccess(supabase, user.id, saved.orgId)
  if (!access || !hasRole(access.role, "admin")) return settings("not-admin")
  // Its address now, if it was renamed while they were on GitHub.
  const { data: org } = await supabase.from("orgs").select("slug").eq("id", saved.orgId).maybeSingle()
  slug = org?.slug ?? slug

  // A member of a GitHub organization who may not install apps there asks
  // its owners to; nothing is installed until one of them approves.
  if (params.get("setup_action") === "request") return settings("requested")

  const installationId = Number(params.get("installation_id"))
  const code = params.get("code")
  if (!Number.isSafeInteger(installationId) || installationId <= 0 || !code) return settings("failed")

  if (!(await personCanSeeInstallation(config, code, installationId).catch(() => false))) return settings("denied")
  const account = await installationAccount(config, installationId).catch(() => null)
  if (!account) return settings("failed")

  const { error } = await createAdminClient()
    .from("github_connections")
    .upsert(
      {
        org_id: saved.orgId,
        installation_id: installationId,
        account_login: account.login,
        account_type: account.type,
        connected_by: user.id,
      },
      { onConflict: "org_id,installation_id" }
    )
  if (error) {
    console.error("Saving a GitHub connection failed:", error.message)
    return settings("failed")
  }

  await recordStep(supabase, "connected_github")
  // Back to the import they set out from, the dialog open on it.
  if (saved.repository)
    return finish(
      `/${slug}?import=${encodeURIComponent(saved.repository)}&connected=${encodeURIComponent(account.login)}`
    )
  return settings("connected", account.login)
}
