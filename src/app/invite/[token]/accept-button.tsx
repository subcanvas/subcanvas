"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"

import { acceptInvite } from "./actions"

export function AcceptButton({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    acceptInvite.bind(null, token),
    null
  )

  return (
    <form action={action} className="flex flex-col gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Accept invite"}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}
