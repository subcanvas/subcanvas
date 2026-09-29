"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, use, useCallback } from "react"
import { toast } from "sonner"

import { buttonVariants } from "@/components/ui/button"
import { ASK_AN_OWNER, type Upgrade } from "@/lib/billing/limit"
import { cn } from "@/lib/utils"

// Every refusal at a plan limit reads the same, wherever it happens: what
// the limit is (the message, from lib/billing/limit.ts), then what this
// person can do about the plan. An owner is offered the upgrade, anyone
// else is told to ask an owner, and a server that sells no plan says
// neither. The workspace's layout says which applies, once, for every page
// in it.

type Plan = { upgrade: Upgrade; billingHref: string }

const PlanContext = createContext<Plan>({ upgrade: null, billingHref: "" })

export function PlanProvider({ children, ...plan }: Plan & { children: React.ReactNode }) {
  return <PlanContext value={plan}>{children}</PlanContext>
}

export type Refused = { error: string; limit?: true }

// A refusal as a toast. Anything that is not a plan limit is shown as it is.
export function useShowRefusal() {
  const router = useRouter()
  const { upgrade, billingHref } = use(PlanContext)
  return useCallback(
    ({ error, limit }: Refused) => {
      if (!limit || !upgrade) return void toast.error(error)
      if (upgrade === "ask") return void toast.error(error, { description: ASK_AN_OWNER })
      toast.error(error, { action: { label: "Upgrade", onClick: () => router.push(billingHref) } })
    },
    [router, upgrade, billingHref]
  )
}

// The same, in a dialog or a form, where the refusal stays in view.
export function LimitRefusal({ refused }: { refused: Refused }) {
  const { upgrade, billingHref } = use(PlanContext)
  const advice = refused.limit ? upgrade : null
  return (
    <div role="alert" className="flex flex-col items-start gap-2 text-sm">
      <p className="text-destructive">{refused.error}</p>
      {advice === "ask" && <p className="text-graphite">{ASK_AN_OWNER}</p>}
      {advice === "offer" && (
        <Link href={billingHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Upgrade
        </Link>
      )}
    </div>
  )
}
