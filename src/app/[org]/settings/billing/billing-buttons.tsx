"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"

import { openPortal, startCheckout } from "./actions"

export function BillingButton({
  orgId,
  kind,
  label,
}: {
  orgId: string
  kind: "checkout" | "portal"
  label: string
}) {
  const [state, action, pending] = useActionState(
    async () => (kind === "checkout" ? startCheckout(orgId) : openPortal(orgId)),
    null
  )

  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Opening Stripe…" : label}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}
