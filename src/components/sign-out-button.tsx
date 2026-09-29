"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

// For the pages outside the app, where there is no account menu: signs out
// and goes to sign in. With `next`, signing in again comes back to it, which
// is what someone signed in as the wrong account wants.
export function SignOutButton({ next }: { next?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function signOut() {
    startTransition(async () => {
      await createClient().auth.signOut()
      router.push(next ? `/login?next=${encodeURIComponent(next)}` : "/login")
      router.refresh()
    })
  }

  return (
    <Button variant="link" className="h-auto p-0 text-ink underline underline-offset-4" disabled={pending} onClick={signOut}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  )
}
