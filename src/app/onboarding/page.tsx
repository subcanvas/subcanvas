import { requireUser } from "@/lib/auth"

import { CreateOrgForm } from "./create-org-form"

export default async function OnboardingPage() {
  await requireUser("/onboarding")

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <CreateOrgForm />
    </main>
  )
}
