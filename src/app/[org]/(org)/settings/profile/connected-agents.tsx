"use client"

import { Bot } from "lucide-react"
import Link from "next/link"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

import { revokeAgent } from "./actions"

export type ConnectedAgent = { clientId: string; name: string; approved: string }

// The agents this person let in on the consent page, one Revoke each.
export function ConnectedAgents({ agents, connectHref }: { agents: ConnectedAgent[]; connectHref: string }) {
  if (!agents.length)
    return (
      <p className="text-sm text-graphite">
        No agents are connected.{" "}
        <Link href={connectHref} className="font-medium text-ink underline underline-offset-4">
          Connect an agent
        </Link>
      </p>
    )

  return (
    <ul className="-my-3 divide-y divide-rule">
      {agents.map((agent) => (
        <Agent key={agent.clientId} agent={agent} />
      ))}
    </ul>
  )
}

function Agent({ agent }: { agent: ConnectedAgent }) {
  const [pending, startTransition] = useTransition()

  function revoke() {
    startTransition(async () => {
      const result = await revokeAgent(agent.clientId)
      if ("error" in result) return void toast.error(result.error)
      toast.success(`${agent.name} is disconnected.`)
    })
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <Bot className="size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{agent.name}</span>
        <span className="text-sm text-graphite">Approved {agent.approved}</span>
      </div>
      <Button variant="outline" size="sm" disabled={pending} onClick={revoke} aria-label={`Revoke ${agent.name}`}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
    </li>
  )
}
