import { AuthShell } from "@/components/auth-shell"
import { requireUser } from "@/lib/auth"

import { CreateOrgForm } from "./create-org-form"

export default async function OnboardingPage() {
  await requireUser("/onboarding")

  return (
    <AuthShell>
      <CreateOrgForm />
    </AuthShell>
  )
}
