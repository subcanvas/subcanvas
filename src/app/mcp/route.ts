import { createMcpHandler } from "@modelcontextprotocol/server"

import { bearerToken, identify } from "@/lib/mcp/auth"
import { requestOrigin, RESOURCE_METADATA_PATH } from "@/lib/mcp/origin"
import { createServer } from "@/lib/mcp/server"

// The MCP server: streamable HTTP, stateless, one short-lived server per
// request (docs/MCP.md). It needs Node for BlockNote's headless editor.
export const runtime = "nodejs"
// A tool call is a few database round trips. The slow one is a repository
// import, which reads a repository from GitHub and writes dozens of
// documents; a minute covers the largest import that is allowed.
export const maxDuration = 60

// What the MCP authorization specification asks for when a request carries
// no usable token: a 401 that says where to read how to get one (RFC 9728).
function unauthorized(request: Request, invalid: boolean) {
  const metadata = `${requestOrigin(request)}${RESOURCE_METADATA_PATH}`
  const challenge = [
    `Bearer resource_metadata="${metadata}"`,
    ...(invalid
      ? [`error="invalid_token"`, `error_description="The access token is missing, expired, or not valid here"`]
      : []),
  ].join(", ")
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Sign in to Subcanvas to use this server." }, id: null },
    { status: 401, headers: { "WWW-Authenticate": challenge } }
  )
}

// The handler calls the factory for each request and hands it the caller
// this route verified, so a server is never built for anyone else.
const handler = createMcpHandler(
  ({ authInfo, requestInfo }) => {
    const userId = authInfo?.extra?.userId
    if (!authInfo || typeof userId !== "string" || !requestInfo)
      throw new Error("The MCP server was reached without a verified caller.")
    return createServer({ userId, token: authInfo.token }, requestOrigin(requestInfo))
  },
  { onerror: (error) => console.error("mcp:", error.message) }
)

async function serve(request: Request) {
  const token = bearerToken(request)
  const caller = token ? await identify(token) : null
  if (!caller) return unauthorized(request, token !== null)

  return handler.fetch(request, {
    authInfo: {
      token: caller.token,
      clientId: caller.clientId ?? "",
      scopes: [],
      expiresAt: caller.expiresAt,
      extra: { userId: caller.userId },
    },
  })
}

export { serve as GET, serve as POST, serve as DELETE }
