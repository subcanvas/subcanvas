"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"

import { decideAuthorization } from "./actions"

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
