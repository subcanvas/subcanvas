import { AuthShell } from "@/components/auth-shell"
import { requireUser } from "@/lib/auth"

import { CreateOrgForm } from "./create-org-form"

export const metadata = { title: "Create your org" }

export default async function OnboardingPage() {
  await requireUser("/onboarding")

  return (
    <AuthShell>
      <CreateOrgForm />
    </AuthShell>
  )
}
