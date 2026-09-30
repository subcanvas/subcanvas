import "server-only"

import { authorizationServer } from "@/lib/mcp/auth"

// Whether an agent can sign in to this server. That needs Supabase's OAuth
// server (docs/MCP.md, "Turning it on"), which a self-hosted project may not
// have switched on, and Supabase Auth publishes its OAuth metadata only
// while it is. Pages that offer to connect an agent ask this first, so a
// server where no agent could finish signing in does not offer it.
//
// The answer changes only when an operator flips the setting, so it is kept
// for five minutes per server instance. When Auth cannot be reached the last
// answer stands; before there is one, the offer is left out.
const KEEP_MS = 5 * 60 * 1000

let known: { available: boolean; at: number } | undefined

export async function agentSignInAvailable(): Promise<boolean> {
  if (known && Date.now() - known.at < KEEP_MS) return known.available
  try {
    const response = await fetch(`${authorizationServer()}/.well-known/oauth-authorization-server`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })
    known = { available: response.ok, at: Date.now() }
    return known.available
  } catch {
    return known?.available ?? false
  }
}
