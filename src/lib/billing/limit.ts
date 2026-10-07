import type { Role } from "@/lib/roles"

// Codes the database raises when a free workspace is at a plan limit.
export const PRIVATE_DOCUMENT_LIMIT_CODE = "GN001"
export const EDITOR_LIMIT_CODE = "GN002"

// What was refused, in words that are true for whoever reads them: the
// owner, an editor, an agent. What they can do about it depends on who they
// are, and is said beside it (components/limit-refusal.tsx, and the MCP
// server for agents): an owner is offered the upgrade, anyone else is told
// to ask an owner, and a server that sells no plan says neither.
export function privateDocumentLimitMessage(limit?: number) {
  return `This would take the workspace past the free plan's ${limit ? `${limit} private documents` : "limit on private documents"}. Documents in public projects and in the trash do not count.`
}

export function editorLimitMessage(limit?: number) {
  const editors = limit === 1 ? "one editor" : limit ? `${limit} editors` : "limit on editors"
  return `This would take the workspace past the free plan's ${editors}. Viewers are unlimited.`
}

// The limit is the one number in the database's message.
function limitIn(message: string | undefined) {
  const found = message?.match(/\d+/)
  return found ? Number(found[0]) : undefined
}

export function limitMessage(code: string | undefined, message?: string) {
  if (code === PRIVATE_DOCUMENT_LIMIT_CODE) return privateDocumentLimitMessage(limitIn(message))
  if (code === EDITOR_LIMIT_CODE) return editorLimitMessage(limitIn(message))
  return null
}

// What someone who meets a plan limit can do about the plan: upgrade it
// ("offer"), which only an owner can; ask an owner to ("ask"); or nothing,
// on a server that sells no plan (null), where the limits are the
// operator's and there is nothing to buy.
export type Upgrade = "offer" | "ask" | null

export function upgradeFor(role: Role | null, billing: boolean): Upgrade {
  if (!billing) return null
  return role === "owner" ? "offer" : "ask"
}

export const ASK_AN_OWNER = "Ask an owner of this workspace to upgrade it to Pro."
