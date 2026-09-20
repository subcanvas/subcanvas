import "server-only"

import { McpServer } from "@modelcontextprotocol/server"

import { createUserClient, type Caller } from "./auth"
import type { ToolContext } from "./tool"
import { tools } from "./tools"

export const SERVER_INFO = { name: "subcanvas", title: "Subcanvas", version: "0.1.0" }

const INSTRUCTIONS = [
  "Subcanvas is a whiteboard where every box opens: any node, group, or arrow can hold a text document or a whole nested whiteboard.",
  "You act as the signed-in person, with their role in each org. Start with list_orgs, then list_projects and get_project to find documents. Everything is addressed by id.",
  "People may be editing the same documents while you work. Your edits merge with theirs, so change only what you mean to: update fields in place, and address text by block id.",
  "To draw a diagram: add_nodes, then connect_nodes with the returned ids, then arrange_nodes. To go deeper, attach_document with type whiteboard puts a new diagram inside a node.",
].join("\n")

// One server per request, for one caller. Nothing is kept between requests,
// so it runs on serverless functions, and a tool can only ever reach the
// Supabase client of the person whose token came with the request.
export function createServer(caller: Pick<Caller, "userId" | "token">, origin: string) {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  const context: ToolContext = { supabase: createUserClient(caller.token), userId: caller.userId, origin }

  for (const tool of tools)
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: tool.annotations,
      },
      async (args) => {
        const result = await tool.run(context, args)
        return "error" in result
          ? { isError: true, content: [{ type: "text", text: result.error }] }
          : { content: [{ type: "text", text: result.text }], structuredContent: result.data }
      }
    )
  return server
}
