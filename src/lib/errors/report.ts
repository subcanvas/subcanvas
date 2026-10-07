// Reports an error from the browser to this site's own route (app/api/errors),
// which stores it in our database: no third party and no library. It sends
// the error's name, message and stack and the route as a pattern
// (/[org]/[project]/d/[docId]), never the page's address. Each error is sent
// once per tab, and a tab sends at most MAX_PER_TAB.
//
// components/error-reporter.tsx sends what nothing caught. Call reportError
// for an error that was caught but should still be known about.

const ENDPOINT = "/api/errors"
const MAX_PER_TAB = 20
const MAX_MESSAGE = 2000
const MAX_STACK = 8000

let route = "/"
const sent = new Set<string>()

// Kept up to date by the error reporter as the person moves around.
export function setReportRoute(pattern: string) {
  route = pattern
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === "string") return new Error(value)
  try {
    return new Error(JSON.stringify(value)?.slice(0, 200) ?? String(value))
  } catch {
    return new Error(String(value))
  }
}

// Not the app's: a script from another origin that the browser does not let
// us see into, a browser extension, and the browser's own layout warning.
function foreign(error: Error) {
  return (
    (error.message === "Script error." && !error.stack) ||
    /(chrome|moz|safari(-web)?)-extension:\/\//.test(error.stack ?? "") ||
    error.message.startsWith("ResizeObserver loop")
  )
}

export function reportError(value: unknown) {
  if (typeof window === "undefined") return
  const error = toError(value)
  if (foreign(error)) return
  const key = `${error.name}: ${error.message}`.slice(0, 500)
  if (sent.has(key) || sent.size >= MAX_PER_TAB) return
  sent.add(key)

  const body = JSON.stringify({
    name: error.name || "Error",
    message: error.message.slice(0, MAX_MESSAGE),
    stack: error.stack?.slice(0, MAX_STACK) ?? null,
    route,
  })
  try {
    if (navigator.sendBeacon?.(ENDPOINT, body)) return
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {})
  } catch {
    // Reporting must never be the next error.
  }
}
