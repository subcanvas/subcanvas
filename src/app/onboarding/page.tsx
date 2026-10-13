import { AuthShell } from "@/components/auth-shell"
import { requireUser } from "@/lib/auth"
import { WORKSPACE_HOME } from "@/lib/home"

import { CreateOrgForm } from "./create-org-form"

export const metadata = { title: "New workspace" }

// Where "New workspace" in the sidebar leads, and where someone in no
// workspace at all lands (auth/home): every account starts with one, but it
// can be left or deleted like any other. `from` is the workspace the sidebar
// was opened in, which "Back" returns to; with no workspace there is no
// "Back".
export default async function NewWorkspacePage({ searchParams }: PageProps<"/onboarding">) {
  const { supabase, user } = await requireUser("/onboarding")
  const { from } = await searchParams
  const [{ data: origin }, { count }] = await Promise.all([
    typeof from === "string"
      ? supabase.from("orgs").select("name, slug").eq("slug", from).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("org_members").select("org_id", { count: "exact", head: true }).eq("user_id", user.id),
  ])
  const back = origin
    ? { href: `/${origin.slug}`, label: `Back to ${origin.name}` }
    : count
      ? { href: WORKSPACE_HOME, label: "Back to your workspace" }
      : null

  return (
    <AuthShell>
      <CreateOrgForm back={back} email={user.email ?? ""} />
    </AuthShell>
  )
}
