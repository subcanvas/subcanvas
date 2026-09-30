import "server-only"

import { McpServer } from "@modelcontextprotocol/server"

import { createUserClient, type Caller } from "./auth"
import type { ToolContext } from "./tool"
import { tools } from "./tools"

export const SERVER_INFO = { name: "subcanvas", title: "Subcanvas", version: "0.1.0" }

const INSTRUCTIONS = [
  "Subcanvas is a whiteboard where every box opens: any node or arrow can hold a page or a whole nested whiteboard.",
  "Words, as the app uses them: a document is a whiteboard or a page (a page is what the tools call a text document, type `text`). On a whiteboard, a node is a box (kind `plain`), a text node (a heading with body text, no box), a group, or a picture or video (kind `media`); arrows (`edges`) join nodes. A page that belongs to a node or arrow is its description. Links to a document from elsewhere are listed by list_references, which the app shows as Linked from.",
  "You act as the signed-in person, with their role in each workspace. Start with list_workspaces, then list_projects and get_project to find documents. Everything is addressed by id.",
  "People may be editing the same documents while you work. Your edits merge with theirs, so change only what you mean to: update fields in place, and address text by block id.",
  "To draw a diagram: add_nodes, then connect_nodes with the returned ids, then arrange_nodes. To go deeper, attach_document with type whiteboard puts a new whiteboard inside a node.",
].join("\n")

// One server per request, for one caller. Nothing is kept between requests,
// so it runs on serverless functions, and a tool can only ever reach the
// Supabase client of the person whose token came with the request.
//
// The tools are the same for the life of a deployment, and the server says
// so (`listChanged: false`). Otherwise a client on the 2026-07-28 protocol
// holds a `subscriptions/listen` request open to hear about changes, and the
// function is cut off at its time limit and reopened, once a minute, for as
// long as the agent stays connected.
export function createServer(caller: Pick<Caller, "userId" | "token">, origin: string) {
  const server = new McpServer(SERVER_INFO, {
    instructions: INSTRUCTIONS,
    capabilities: { tools: { listChanged: false } },
  })
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
