"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

// For someone signed in as another account than the one invited: signs out
// and goes to sign-in, which brings them back to the invite afterwards.
export function SignOutButton({ next }: { next: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await createClient().auth.signOut()
          router.push(`/login?next=${encodeURIComponent(next)}`)
          router.refresh()
        })
      }
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  )
}
