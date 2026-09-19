import { AuthShell } from "@/components/auth-shell"
import { redirect } from "next/navigation"

import { safeNext } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

import { LoginForm } from "./login-form"

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams
  const next = safeNext(typeof params.next === "string" ? params.next : null)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect(next)

  const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is "google" | "github" => p === "google" || p === "github")

  return (
    <AuthShell>
      <LoginForm
        next={next}
        providers={providers}
        linkError={params.error === "link"}
      />
    </AuthShell>
  )
}
