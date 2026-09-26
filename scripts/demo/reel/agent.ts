/**
 * The agent scene of the demo (see demo.ts), as a real agent run, replayed.
 *
 * Before the camera rolls, once, Claude Code runs headless in this checkout
 * with the Subcanvas MCP server, signed in as the demo account, and is given
 * one request. Its steps, its last message and the edits it made through the
 * MCP server are kept beside the renders; the edits are then undone. On
 * camera, the terminal shows that run, and at the moment it made its edits
 * the same MCP calls are made again, so what it drew arrives on the diagram
 * live, over the same Realtime channel any other client's edit would.
 */

import { spawnSync } from "node:child_process"

export type ToolResult = { text: string; data: Record<string, unknown> }
export type Mcp = (name: string, args: Record<string, unknown>) => Promise<ToolResult>

// A client for the app's MCP endpoint that sends one JSON-RPC request per
// call. The server is stateless and answers with one server-sent event.
export function mcpClient(base: string, token: string): Mcp {
  let id = 0
  return async (name, args) => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }),
    })
    const body = await response.text()
    const json = body.startsWith("{") ? body : body.split("\n").find((line) => line.startsWith("data: "))?.slice(6)
    if (!response.ok || !json) throw new Error(`demo: MCP ${name} answered ${response.status}: ${body.slice(0, 300)}`)
    const message = JSON.parse(json) as {
      result?: { isError?: boolean; content?: { text?: string }[]; structuredContent?: Record<string, unknown> }
      error?: { message: string }
    }
    const text = message.result?.content?.map((part) => part.text ?? "").join("\n") ?? ""
    if (message.error || message.result?.isError) throw new Error(`demo: MCP ${name} failed: ${message.error?.message ?? text}`)
    return { text, data: message.result?.structuredContent ?? {} }
  }
}

// What the agent did, as kept between renders.
export type AgentRun = {
  prompt: string
  // Each tool it used, in order.
  steps: { name: string; input: Record<string, unknown> }[]
  // Its last message.
  reply: string
  // The edits it made, in order, to be made again on camera.
  writes: { name: string; input: Record<string, unknown>; data: Record<string, unknown> }[]
}

// The tools the agent may use: reading this checkout, and reading and
// drawing on whiteboards. Nothing else, and nothing it could delete with.
const READ_TOOLS = ["Read", "Grep", "Glob"]
const MCP_READS = ["list_orgs", "list_projects", "get_project", "read_whiteboard"]
const MCP_WRITES = ["connect_nodes", "attach_document", "update_edges"]

const shortTool = (name: string) => name.replace(/^mcp__subcanvas__/, "")

// The steps, the way Claude Code lists them: each MCP call by server and
// name, and the file reading between them as one line ("Read 5 files,
// searched 4 times"), with a step repeated right away listed once.
// ToolSearch, which only loads tool descriptions, and tools it was refused
// are left out.
export function describeSteps(run: AgentRun, allowed = READ_TOOLS): string[] {
  const lines: string[] = []
  let reads = 0
  let searches = 0
  const flush = () => {
    const parts = [
      reads ? `Read ${reads} file${reads === 1 ? "" : "s"}` : "",
      searches ? `searched ${searches} time${searches === 1 ? "" : "s"}` : "",
    ].filter(Boolean)
    if (parts.length) lines.push(parts.join(", ").replace(/^s/, "S"))
    reads = 0
    searches = 0
  }
  for (const { name } of run.steps) {
    if (name === "Read" && allowed.includes(name)) reads++
    else if ((name === "Grep" || name === "Glob") && allowed.includes(name)) searches++
    else if (name.startsWith("mcp__")) {
      flush()
      const [, server, tool] = name.split("__")
      const line = `${server} - ${tool} (MCP)`
      if (lines.at(-1) !== line) lines.push(line)
    }
  }
  flush()
  return lines
}

// The ids in a write's text, when only the text comes back: "Added 1 arrow
// (id)." from connect_nodes, "Created the description (id) inside the
// object." from attach_document.
function fromText(parts: unknown[]): Record<string, unknown> {
  const text = parts.map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? "")).join("\n")
  const arrows = text.match(/Added \d+ arrows? \(([^)]+)\)/)
  if (arrows) return { edge_ids: arrows[1].split(",").map((id) => id.trim()) }
  const document = text.match(/Created the .*? \(([0-9a-f-]{36})\)/)
  return document ? { document_id: document[1] } : {}
}

// Runs Claude Code once and collects what it did. Needs the `claude` CLI,
// signed in; the MCP token is the demo account's and is passed to it in the
// config argument, never written to a file.
export function runAgent({ cwd, base, token, prompt }: { cwd: string; base: string; token: string; prompt: string }): AgentRun {
  const config = JSON.stringify({
    mcpServers: { subcanvas: { type: "http", url: `${base}/mcp`, headers: { Authorization: `Bearer ${token}` } } },
  })
  const allowed = [...READ_TOOLS, ...[...MCP_READS, ...MCP_WRITES].map((tool) => `mcp__subcanvas__${tool}`)]
  const run = spawnSync(
    process.env.DEMO_CLAUDE ?? "claude",
    [
      "-p", prompt,
      "--mcp-config", config,
      "--strict-mcp-config",
      "--allowedTools", allowed.join(","),
      "--setting-sources", "project",
      "--output-format", "stream-json",
      "--verbose",
    ],
    { cwd, encoding: "utf8", timeout: 10 * 60_000, maxBuffer: 64 * 1024 * 1024 }
  )
  if (run.status !== 0) throw new Error(`demo: the agent run failed (${run.status}): ${run.stderr?.slice(0, 500)}`)

  type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string; tool_use_id?: string; content?: unknown; is_error?: boolean }
  const steps: string[] = []
  const uses = new Map<string, { name: string; input: Record<string, unknown> }>()
  const writes: AgentRun["writes"] = []
  let reply = ""
  for (const line of run.stdout.split("\n")) {
    if (!line.trim().startsWith("{")) continue
    const event = JSON.parse(line) as { type: string; message?: { content?: Block[] }; result?: string }
    if (event.type === "result" && typeof event.result === "string") reply = event.result.trim()
    for (const block of event.message?.content ?? []) {
      if (block.type === "tool_use" && block.name && block.id) {
        uses.set(block.id, { name: block.name, input: block.input ?? {} })
        steps.push({ name: block.name, input: block.input ?? {} })
      }
      if (block.type === "tool_result" && block.tool_use_id && !block.is_error) {
        const use = uses.get(block.tool_use_id)
        if (!use || !MCP_WRITES.includes(shortTool(use.name))) continue
        // The structured half of the result comes back as JSON text.
        const parts = Array.isArray(block.content) ? block.content : [block.content]
        const data = parts
          .map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? ""))
          .map((text) => {
            try {
              return JSON.parse(text) as Record<string, unknown>
            } catch {
              return null
            }
          })
          .find((value) => value && typeof value === "object") ?? fromText(parts)
        writes.push({ name: shortTool(use.name), input: use.input, data })
      }
    }
  }
  if (!writes.some((write) => write.name === "connect_nodes"))
    throw new Error(`demo: the agent drew no arrow. It said: ${reply.slice(0, 500)}`)
  return { prompt, steps, reply, writes }
}

// What an edit made, to take away again.
export type Made = { whiteboard_id: string; edge_ids: string[]; document_ids: string[] }

// Makes the agent's edits again, in order, mapping the ids its first run
// got back to the ones this run gets. Returns what was made.
export async function replay(mcp: Mcp, run: AgentRun): Promise<Made> {
  const ids = new Map<string, string>()
  const swap = (value: unknown): unknown =>
    typeof value === "string" ? (ids.get(value) ?? value)
    : Array.isArray(value) ? value.map(swap)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swap(v)]))
    : value
  const made: Made = { whiteboard_id: "", edge_ids: [], document_ids: [] }
  for (const write of run.writes) {
    const result = await mcp(write.name, swap(write.input) as Record<string, unknown>)
    made.whiteboard_id ||= String(write.input.whiteboard_id ?? "")
    const before = (write.data.edge_ids as string[] | undefined) ?? []
    const after = (result.data.edge_ids as string[] | undefined) ?? []
    before.forEach((id, i) => after[i] && ids.set(id, after[i]))
    made.edge_ids.push(...after)
    const document = result.data.document_id as string | undefined
    if (document) {
      if (write.data.document_id) ids.set(String(write.data.document_id), document)
      made.document_ids.push(document)
    }
  }
  return made
}

// Takes away what an edit made: the arrows, then the documents they held.
// Checked afterwards and tried again for a while: an edit read back straight
// after it was made is not always there yet, and a delete that finds
// nothing is not an error, so without the check an arrow can stay.
export async function undo(mcp: Mcp, made: Made) {
  if (made.edge_ids.length) {
    const left = async () => {
      const board = await mcp("read_whiteboard", { whiteboard_id: made.whiteboard_id })
      const ids = new Set(((board.data.edges as { id: string }[] | undefined) ?? []).map((edge) => edge.id))
      return made.edge_ids.filter((id) => ids.has(id))
    }
    for (let attempt = 0; ; attempt++) {
      const remaining = await left()
      if (!remaining.length) break
      if (attempt === 10) throw new Error(`demo: could not take the agent's arrows off the sheet (${remaining.join(", ")})`)
      await mcp("delete_edges", { whiteboard_id: made.whiteboard_id, edge_ids: remaining })
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  for (const document_id of made.document_ids) await mcp("trash_document", { document_id })
}

// What the agent's own first run made, from its record.
export const madeBy = (run: AgentRun): Made => ({
  whiteboard_id: String(run.writes[0]?.input.whiteboard_id ?? ""),
  edge_ids: run.writes.flatMap((write) => (write.data.edge_ids as string[] | undefined) ?? []),
  document_ids: run.writes.flatMap((write) => (write.data.document_id ? [String(write.data.document_id)] : [])),
})
