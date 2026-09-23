// The MCP endpoint's addresses. The origin helpers live in @/lib/origin:
// auth needs them too.
export { originFromHeaders, requestOrigin } from "@/lib/origin"

export const MCP_PATH = "/mcp"
export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource"
