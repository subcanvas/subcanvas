import { AuthShell } from "@/components/auth-shell"
import { requireUser } from "@/lib/auth"
import { WORKSPACE_HOME } from "@/lib/home"

import { CreateOrgForm } from "./create-org-form"

export const metadata = { title: "New team workspace" }

// Where "New team workspace" in the switcher leads. Nobody has to come here:
// every account already has a personal workspace. `from` is the workspace
// the switcher was opened in, which "Back" returns to.
export default async function NewTeamWorkspacePage({ searchParams }: PageProps<"/onboarding">) {
  const { supabase, user } = await requireUser("/onboarding")
  const { from } = await searchParams
  const { data: origin } =
    typeof from === "string"
      ? await supabase.from("orgs").select("name, slug").eq("slug", from).maybeSingle()
      : { data: null }
  const back = origin
    ? { href: `/${origin.slug}`, label: `Back to ${origin.name}` }
    : { href: WORKSPACE_HOME, label: "Back to your workspace" }

  return (
    <AuthShell>
      <CreateOrgForm back={back} email={user.email ?? ""} />
    </AuthShell>
  )
}
