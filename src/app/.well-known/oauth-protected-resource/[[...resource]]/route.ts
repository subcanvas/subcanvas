import { authorizationServer } from "@/lib/mcp/auth"
import { MCP_PATH, requestOrigin } from "@/lib/mcp/origin"

// OAuth 2.0 Protected Resource Metadata (RFC 9728), which is how an MCP
// client finds out where to sign in: it names Supabase Auth as this
// server's authorization server. Clients ask at the root or at the path of
// the MCP endpoint (/.well-known/oauth-protected-resource/mcp); both get
// the same answer.
export function GET(request: Request) {
  const origin = requestOrigin(request)
  return Response.json(
    {
      resource: `${origin}${MCP_PATH}`,
      authorization_servers: [authorizationServer()],
      bearer_methods_supported: ["header"],
      resource_name: "Subcanvas",
      resource_documentation: `${origin}/login`,
    },
    { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } }
  )
}
