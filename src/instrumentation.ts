import type { Instrumentation } from "next"

// Every error the server catches, as one line of JSON in the function log, so
// that on a busy day a failure can be found by route and matched to what a
// person saw (the digest is what an error page shows). It records where and
// what, never who: no headers, no cookies, no query string, since those carry
// sessions, tokens, and the ids in sign-in and consent links.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const failure = error instanceof Error ? error : new Error(String(error))
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined
  console.error(
    JSON.stringify({
      event: "request_error",
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
      renderSource: "renderSource" in context ? context.renderSource : undefined,
      digest,
      message: failure.message,
      stack: failure.stack?.split("\n").slice(0, 8).join("\n"),
    })
  )
}
