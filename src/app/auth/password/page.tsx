import { AuthShell } from "@/components/auth-shell"
import { requireUser, safeNext } from "@/lib/auth"

import { PasswordForm } from "./password-form"

export const metadata = { title: "Set a password" }

// Where a reset link lands, and where anyone signed in (by link, Google, or
// GitHub) can give their account a password.
export default async function PasswordPage({ searchParams }: PageProps<"/auth/password">) {
  const params = await searchParams
  const next = safeNext(typeof params.next === "string" ? params.next : null)
  const { user } = await requireUser("/auth/password")

  return (
    <AuthShell>
      <PasswordForm email={user.email ?? ""} next={next} />
    </AuthShell>
  )
}
