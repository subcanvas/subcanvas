// Where this deployment is reached from outside. Behind a proxy (Vercel, or
// a self-hoster's own) the request's URL can name an internal host, and the
// forwarded headers name the real one.
export function requestOrigin(request: Request) {
  const url = new URL(request.url)
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  return `${protocol}://${host}`
}

export const MCP_PATH = "/mcp"
export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource"
