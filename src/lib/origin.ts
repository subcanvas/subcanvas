// Where this deployment is reached from outside. Behind a proxy (Vercel, or
// a self-hoster's own) the request's URL can name an internal host, and the
// forwarded headers name the real one.
//
// `next start` does not read the forwarded headers itself: a request's URL is
// always the address the server listens on, so an absolute redirect built
// from it sends people to localhost. Anything that builds an absolute URL
// from a request goes through here.
export function originFromHeaders(headers: Headers, fallback?: URL) {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? fallback?.host
  const local = host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
  const protocol =
    headers.get("x-forwarded-proto") ?? fallback?.protocol.replace(":", "") ?? (local ? "http" : "https")
  return `${protocol}://${host}`
}

export const requestOrigin = (request: Request) =>
  originFromHeaders(request.headers, new URL(request.url))
