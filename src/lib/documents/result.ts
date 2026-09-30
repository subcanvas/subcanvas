import { limitMessage } from "@/lib/billing/limit"

// How an operation on a project's folders and documents answers, for the
// server actions, the MCP tools and the canvas alike.

// `limit` marks the free plan's limit, so the caller can say what to do
// about it (lib/billing/limit.ts).
export type OperationResult<T = object> = { error: string; limit?: true } | ({ ok: true } & T)

export const NOT_ALLOWED = { error: "You do not have permission to do that." }

export function fail(error: { code?: string; message: string }): { error: string; limit?: true } {
  const limit = limitMessage(error.code, error.message)
  if (limit) return { error: limit, limit: true }
  return error.code === "42501" ? NOT_ALLOWED : { error: error.message }
}
