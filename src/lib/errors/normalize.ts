// What an error report keeps, and how reports of the same error are found
// to be one (migration error_reports). Where and what, never who: the route
// as a pattern, the message and stack with ids, numbers, addresses and query
// strings taken out. Plain functions, so the server, the browser route and
// the tests share them.

export type ErrorSource = "server" | "browser"

export type ErrorReport = {
  source: ErrorSource
  name: string
  message: string
  stack?: string | null
  // A route pattern or a path; normalizeRoute keeps only the pattern.
  route: string
}

export type NormalizedError = {
  fingerprint: string
  source: ErrorSource
  name: string
  message: string
  stack: string | null
  route: string
}

export const MAX_NAME = 200
export const MAX_MESSAGE = 1000
export const MAX_STACK = 4000
const MAX_ROUTE = 200
const STACK_FRAMES = 20
const FINGERPRINT_FRAMES = 3

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
// Where the server's files are on the machine that runs it, up to the
// app's own build or its packages: the same error on two machines is one.
const LOCAL_PATH = /(?<=^|[\s(])(?:file:\/\/)?\/[^\s():]*?\/(node_modules|\.next)\//g
const HEX = /\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi
const NUMBER = /\b\d+\b/g
// A web address: kept as far as its host, and its path only when it is one
// of the app's own scripts. A page's path names a workspace and its ids.
const URL = /\b(https?:\/\/[^\s/?#)'"]+)(\/[^\s?#)'"]*)?(?:[?#][^\s)'"]*)?/g

function scrubUrls(text: string) {
  return text.replace(URL, (_, origin: string, path = "") =>
    path.startsWith("/_next/") ? `${origin}${path}` : origin
  )
}

// Takes out what differs between two occurrences of one error, and anything
// that could say who it happened to.
export function normalizeText(text: string) {
  return scrubUrls(text.replace(LOCAL_PATH, "$1/"))
    .replace(UUID, "<id>")
    .replace(EMAIL, "<email>")
    .replace(HEX, "<hex>")
    .replace(NUMBER, "<n>")
}

export function normalizeMessage(message: string) {
  return normalizeText(message).replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE)
}

// A stack's frames: V8's "at f (file:1:2)" and Firefox's and Safari's
// "f@file:1:2". The message lines above them are left out.
const isFrame = (line: string) => line.startsWith("at ") || /^[^\s]*@\S+:\d+:\d+$/.test(line)

function frames(stack: string) {
  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter(isFrame)
}

export function normalizeStack(stack: string | null | undefined) {
  if (!stack) return null
  const kept = frames(stack).slice(0, STACK_FRAMES).map(normalizeText)
  return kept.length ? kept.join("\n").slice(0, MAX_STACK) : null
}

// The segments that are the same for everyone, the app's own folders under
// src/app (a unit test keeps this list in step with them). Anything else in
// a reported route is a real address and is not kept.
export const STATIC_SEGMENTS = new Set([
  ".well-known", "agents", "api", "appearance", "auth", "billing", "callback", "consent", "cron", "d",
  "daily-summary", "documents", "embed.svg", "errors", "export", "general", "home", "invite", "login",
  "markdown", "mcp", "media", "members", "mermaid", "oauth", "oauth-protected-resource", "onboarding", "p", "password",
  "privacy", "profile", "projects", "release", "settings", "stripe", "svg", "terms", "trash", "webhook",
])

const PARAM = /^\[{1,2}(?:\.\.\.)?[A-Za-z0-9_]+\]{1,2}$/
// The file a route's code is in, as the server names it: /[org]/page.
const FILE = new Set(["page", "route", "layout", "default", "error", "loading", "not-found", "template"])

// A route pattern such as /[org]/[project]/d/[docId]: from the server's
// route path (route groups and the file name dropped) or from the browser's
// own pattern. A segment that is neither a parameter nor one of the app's
// own is replaced, so a real address or id never gets in.
export function normalizeRoute(route: string) {
  const segments = route
    .split(/[?#]/)[0]
    .replace(/^\/?app(?=\/)/, "")
    .split("/")
    .filter((segment) => segment && !/^\(.*\)$/.test(segment) && !segment.startsWith("@"))
  if (segments.length && FILE.has(segments[segments.length - 1])) segments.pop()
  const kept = segments.map((segment) => (PARAM.test(segment) || STATIC_SEGMENTS.has(segment) ? segment : "[segment]"))
  return `/${kept.join("/")}`.slice(0, MAX_ROUTE)
}

// The pattern of the page a browser is on, from its path and the route's
// parameters: /ada/0b5a…/d/6b1c… with { org, project, docId } becomes
// /[org]/[project]/d/[docId].
export function routePattern(pathname: string, params: Record<string, string | string[] | undefined>) {
  const segments = pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      const at = segments.indexOf(value)
      if (at >= 0) segments[at] = `[${key}]`
    } else if (Array.isArray(value) && value.length) {
      const at = segments.findIndex((_, i) => value.every((part, j) => segments[i + j] === part))
      if (at >= 0) segments.splice(at, value.length, `[...${key}]`)
    }
  }
  return normalizeRoute(`/${segments.join("/")}`)
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

// What makes two reports one error: where it came from, its name, its
// message without what differs, and the top frames of its stack without
// line numbers and build hashes, which change with every release.
export async function normalizeError(report: ErrorReport): Promise<NormalizedError> {
  const name = (report.name || "Error").replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || "Error"
  const message = normalizeMessage(report.message ?? "")
  const stack = normalizeStack(report.stack)
  const top = (stack ?? "")
    .split("\n")
    .slice(0, FINGERPRINT_FRAMES)
    .map((frame) => frame.replace(/:<n>(:<n>)?/g, "").replace(/<hex>/g, ""))
  const fingerprint = await sha256([report.source, name, message, ...top].join("\n"))
  return { fingerprint, source: report.source, name, message, stack, route: normalizeRoute(report.route) }
}
