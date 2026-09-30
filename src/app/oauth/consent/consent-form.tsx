"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"

import { decideAuthorization, signOutInstead } from "./actions"

export function ConsentForm({ authorizationId, clientName }: { authorizationId: string; clientName: string }) {
  const [state, action, pending] = useActionState(
    decideAuthorization.bind(null, authorizationId),
    null
  )

  return (
    <form action={action} className="flex flex-col gap-3">
      <Button type="submit" name="decision" value="approve" disabled={pending}>
        Allow {clientName}
      </Button>
      <Button type="submit" name="decision" value="deny" variant="outline" disabled={pending}>
        Cancel
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}

// "Not you?": refuses the request, signs out, and sends the browser back to
// the app with the refusal, where connecting again starts over.
export function SignOutInstead({ authorizationId }: { authorizationId: string }) {
  const [, action, pending] = useActionState(async () => signOutInstead(authorizationId), null)

  return (
    <form action={action} className="inline">
      <Button type="submit" variant="link" className="h-auto p-0 text-ink underline underline-offset-4" disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
    </form>
  )
}
