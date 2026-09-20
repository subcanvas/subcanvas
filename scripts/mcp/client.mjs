// A real MCP client for trying the server by hand:
//
//   node --env-file=.env.local scripts/mcp/client.mjs <email> <password> list
//   node --env-file=.env.local scripts/mcp/client.mjs <email> <password> call <tool> '<json arguments>'
//
// It signs in the way the web app does and sends that person's token, which
// is what an MCP client holds after the OAuth flow. MCP_URL overrides the
// endpoint (default http://localhost:3000/mcp).
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createClient } from "@supabase/supabase-js"

const [email, password, command, toolName, json] = process.argv.slice(2)
if (!email || !password || !["list", "call"].includes(command)) {
  console.error("usage: client.mjs <email> <password> list | call <tool> '<json arguments>'")
  process.exit(2)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } }
)
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
if (error) {
  console.error(`Could not sign in: ${error.message}`)
  process.exit(1)
}

const client = new Client({ name: "subcanvas-script", version: "0.1.0" })
await client.connect(
  new StreamableHTTPClientTransport(new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  })
)

if (command === "list") {
  const { tools } = await client.listTools()
  for (const tool of tools) console.log(`${tool.name}\t${JSON.stringify(tool.annotations)}`)
} else {
  const result = await client.callTool({ name: toolName, arguments: JSON.parse(json ?? "{}") })
  console.log(JSON.stringify(result, null, 2))
}
await client.close()
