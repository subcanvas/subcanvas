import { randomBytes, timingSafeEqual } from "node:crypto"

// What Connect GitHub remembers between sending someone to GitHub and
// GitHub sending them back: a random value GitHub hands back unchanged, and
// the workspace it was for. Kept in a cookie only this server reads, so a
// link someone else made cannot connect an installation to a workspace.

export const CONNECT_COOKIE = "subcanvas-github-connect"
// Long enough to pick repositories on GitHub; short enough to be forgotten.
export const CONNECT_COOKIE_SECONDS = 15 * 60

export type ConnectState = { state: string; orgId: string; slug: string }

export function newConnectState(orgId: string, slug: string): ConnectState {
  return { state: randomBytes(24).toString("base64url"), orgId, slug }
}

export function encodeConnectState(value: ConnectState) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

export function decodeConnectState(cookie: string | undefined): ConnectState | null {
  if (!cookie) return null
  try {
    const value: unknown = JSON.parse(Buffer.from(cookie, "base64url").toString("utf8"))
    if (typeof value !== "object" || value === null) return null
    const { state, orgId, slug } = value as Record<string, unknown>
    if (typeof state !== "string" || typeof orgId !== "string" || typeof slug !== "string") return null
    return { state, orgId, slug }
  } catch {
    return null
  }
}

// Whether the value GitHub handed back is the one this browser was given.
export function sameState(expected: string, given: string | null) {
  if (!given) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}
