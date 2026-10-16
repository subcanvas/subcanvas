import { NextResponse, type NextRequest } from "next/server"

import { gitHubAppConfig, installUrl } from "@/lib/github/app"
import {
  CONNECT_COOKIE,
  CONNECT_COOKIE_SECONDS,
  connectRepository,
  encodeConnectState,
  newConnectState,
} from "@/lib/github/connect-state"
import { findOrgContext } from "@/lib/orgs"
import { requestOrigin } from "@/lib/origin"
import { hasRole } from "@/lib/roles"

// Connect GitHub, step one: an admin of the workspace is sent to GitHub to
// install the app on an account or organization, or to change which
// repositories an installation reads. GitHub sends them back to
// api/github/callback. From the import dialog it carries the repository they
// were importing (`repository=owner/name`), and they come back to it.
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request)
  const config = gitHubAppConfig()
  const slug = request.nextUrl.searchParams.get("workspace") ?? ""
  if (!config || !/^[a-z0-9-]{1,64}$/.test(slug)) return new NextResponse("Not found", { status: 404 })

  const context = await findOrgContext(slug)
  if (!context)
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(`/${slug}/settings/github`)}`)
  if (!hasRole(context.role, "admin"))
    return NextResponse.redirect(`${origin}/${context.org.slug}/settings/github?github=not-admin`)

  const connect = newConnectState(
    context.org.id,
    context.org.slug,
    connectRepository(request.nextUrl.searchParams.get("repository"))
  )
  const response = NextResponse.redirect(installUrl(config, connect.state))
  response.cookies.set(CONNECT_COOKIE, encodeConnectState(connect), {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    // GitHub sends them back with a plain link, which a Lax cookie rides on.
    sameSite: "lax",
    path: "/api/github",
    maxAge: CONNECT_COOKIE_SECONDS,
  })
  return response
}
