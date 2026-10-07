/**
 * The agent scene of the demo (see demo.ts): a real Claude Code session,
 * recorded, and played back.
 *
 * Before the camera rolls, once, Claude Code runs interactively, in a
 * terminal of its own, in a clean copy of this repository, with the
 * Subcanvas MCP server signed in as the demo account, and is given one
 * request. The terminal is recorded as it happens (macOS `script -r`, driven
 * by `expect`), escape codes, timing and all, so what the video shows is
 * Claude Code's own interface, not a likeness of it. What the session drew
 * is read off the whiteboard afterwards and undone.
 *
 * On camera, the recording plays in reelscript's terminal (xterm.js, which
 * draws the same escape codes a terminal app does), sped up, and at the
 * moment the session made its edit the same edit is made again through the
 * MCP server, so the arrow arrives on the diagram live, over the Realtime
 * channel any other client's edit would.
 */

import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

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

// The recorded session, as kept between renders.
export type AgentRun = {
  prompt: string
  // The terminal's size, which the interface was laid out for.
  cols: number
  rows: number
  // What the terminal received, [ms, text], from Claude Code's first screen
  // to the end of its answer.
  events: [number, string][]
  // When its arrow appeared on the whiteboard, in the same ms. Played back,
  // the edit is made again here.
  editAt: number
  // The edits it made, read off the whiteboard, to be made again on camera.
  writes: { name: string; input: Record<string, unknown>; data: Record<string, unknown> }[]
}

// What the session may do: read this checkout, and read and draw on
// whiteboards. The shell, edits to files, and the web are refused.
const ALLOW = [
  "Read", "Grep", "Glob",
  ...["list_workspaces", "list_projects", "get_project", "read_whiteboard", "connect_nodes", "attach_document"].map(
    (tool) => `mcp__subcanvas__${tool}`
  ),
]
const DENY = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch"]

// The session's own settings, where a project keeps them: the model and its
// effort, and none of the editor mode or permission mode of whoever runs
// the demo.
const SETTINGS = {
  model: "opus",
  effortLevel: "medium",
  editorMode: "normal",
  enableAllProjectMcpServers: true,
  permissions: { defaultMode: "default", allow: ALLOW, deny: DENY },
}

// Only this folder's settings and its one MCP server: nothing from the
// account running the demo. `--mcp-config` takes several files, so the
// request comes after `--`.
const FLAGS = "--setting-sources project --strict-mcp-config --mcp-config .mcp.json"

// Answers the one question a fresh folder asks (whether to trust it), then
// lets the session run until it has been quiet for a while, and leaves.
const DRIVER = `set timeout 25
set trusted 0
spawn -noecho sh -c "stty cols $env(AGENT_COLS) rows $env(AGENT_ROWS); exec \\"\\$AGENT_CLAUDE\\" ${FLAGS} -- \\"\\$AGENT_PROMPT\\""
expect {
  -re {safety} { if {!$trusted} { set trusted 1; sleep 1; send "\\r" }; exp_continue }
  -re {.+} { exp_continue }
  timeout { send "\\x03"; sleep 1; send "\\x03"; expect eof; exit 0 }
  eof { exit 0 }
}
`

const strip = (text: string) =>
  text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][A-Z0-9]|\x1b[=>78]/g, "")

// A notice Claude Code shows about the account running it, not about the
// session: how much of its usage is left, and when that resets, in its time
// zone. Drawn as one coloured run of text starting "You've"; each becomes
// an erased line. Anything like it left over stops the recording being
// kept, rather than go in the video.
const ACCOUNT_NOTICE = /\x1b\[[\d;]*m(?:You've|You’ve)(?:(?!\x1b\[39m)[\s\S])*\x1b\[39m/g
const ACCOUNT_WORDS = /weekly\s*limit|usage\s*limit|session\s*limit|resets\s*[A-Z][a-z]{2}\s*\d/
export function blankAccountNotices(events: [number, string][]): [number, string][] {
  const blanked = events.map(([at, text]): [number, string] => [at, text.replace(ACCOUNT_NOTICE, "\x1b[K")])
  const left = blanked.map(([, text]) => strip(text)).join("").match(ACCOUNT_WORDS)
  if (left) throw new Error(`demo: the recording shows a notice about the account ("${left[0]}"); record it again`)
  return blanked
}

// A `script -r` recording: records of a 24-byte header (length, seconds,
// microseconds, direction) and the bytes. Output only, at the time of day
// it arrived, in ms. Decoded as one stream: a record can end in the middle
// of a character, and decoded alone each half would become a replacement
// character, one cell wider than the character, which wraps a full line
// and throws every later redraw a row out.
function parseRecording(file: string): [number, string][] {
  const data = readFileSync(file)
  const events: [number, string][] = []
  const decoder = new TextDecoder("utf-8")
  let at = 0
  while (at + 24 <= data.length) {
    const length = Number(data.readBigUInt64LE(at))
    const seconds = Number(data.readBigUInt64LE(at + 8))
    const micros = data.readUInt32LE(at + 16)
    const direction = String.fromCharCode(data.readUInt32LE(at + 20))
    const bytes = data.subarray(at + 24, at + 24 + length)
    at += 24 + length
    if (direction === "o" && bytes.length) events.push([seconds * 1000 + micros / 1000, decoder.decode(bytes, { stream: true })])
  }
  return events
}

type Board = { nodes: Set<string>; edges: Set<string> }
async function readBoard(mcp: Mcp, whiteboardId: string): Promise<Board> {
  const board = await mcp("read_whiteboard", { whiteboard_id: whiteboardId })
  const ids = (list: unknown) => new Set(((list as { id: string }[] | undefined) ?? []).map((item) => item.id))
  return { nodes: ids(board.data.nodes), edges: ids(board.data.edges) }
}

// Records the session, and watches the whiteboard while it runs for the
// moment its arrow appears. `root` is a copy of the repository for it to run
// in; the MCP token goes to it in the environment, never into a file.
export async function recordAgent({
  root,
  base,
  token,
  prompt,
  whiteboardId,
  cols,
  rows,
}: {
  root: string
  base: string
  token: string
  prompt: string
  // The whiteboard it is expected to draw on.
  whiteboardId: string
  cols: number
  rows: number
}): Promise<AgentRun> {
  mkdirSync(resolve(root, ".claude"), { recursive: true })
  writeFileSync(
    resolve(root, ".mcp.json"),
    JSON.stringify(
      { mcpServers: { subcanvas: { type: "http", url: `${base}/mcp`, headers: { Authorization: "Bearer ${SUBCANVAS_TOKEN}" } } } },
      null,
      2
    ) + "\n"
  )
  writeFileSync(resolve(root, ".claude", "settings.json"), JSON.stringify(SETTINGS, null, 2) + "\n")

  const work = resolve(tmpdir(), "subcanvas-demo-recording")
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  writeFileSync(resolve(work, "driver.exp"), DRIVER)
  const recording = resolve(work, "session.bin")

  // Not the environment of whatever runs the demo: a Claude Code session
  // running it would otherwise pass its own session on to this one.
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined && key !== "CLAUDECODE" && !key.startsWith("CLAUDE_CODE_") && !key.startsWith("CLAUDE_AGENT_"))
      env[key] = value
  Object.assign(env, {
    SUBCANVAS_TOKEN: token,
    AGENT_PROMPT: prompt,
    AGENT_COLS: String(cols),
    AGENT_ROWS: String(rows),
    AGENT_CLAUDE: process.env.DEMO_CLAUDE ?? "claude",
    // No update notice, and none of the account's claude.ai connectors.
    DISABLE_AUTOUPDATER: "1",
    ENABLE_CLAUDEAI_MCP_SERVERS: "false",
  })

  const mcp = mcpClient(base, token)
  const before = await readBoard(mcp, whiteboardId)
  const child = spawn("script", ["-q", "-r", recording, "expect", resolve(work, "driver.exp")], {
    cwd: root,
    env,
    stdio: ["ignore", "ignore", "pipe"],
  })
  let stderr = ""
  child.stderr.on("data", (chunk) => (stderr += chunk))
  const exited = new Promise<number | null>((done) => child.on("exit", done))
  const limit = setTimeout(() => child.kill(), 45 * 60_000)
  // The whiteboard, once a second, until the arrow is there.
  let editAt: number | null = null
  let status: number | null | undefined
  exited.then((code) => (status = code))
  while (status === undefined) {
    await new Promise((done) => setTimeout(done, 1000))
    if (editAt === null) {
      const now = await readBoard(mcp, whiteboardId).catch(() => null)
      if (now && [...now.edges].some((id) => !before.edges.has(id))) editAt = Date.now()
    }
  }
  clearTimeout(limit)
  if (status !== 0) throw new Error(`demo: recording the agent failed (${status}): ${stderr.slice(0, 500)}`)

  const after = await readBoard(mcp, whiteboardId)
  const writes = await editsSince(mcp, whiteboardId, before.edges)
  if ([...before.nodes].some((id) => !after.nodes.has(id)) || [...after.nodes].some((id) => !before.nodes.has(id)))
    throw new Error("demo: the agent changed boxes on the sheet, not only arrows; put the sheet back by hand")
  if (editAt === null || !writes.some((write) => write.name === "connect_nodes"))
    throw new Error(
      `demo: the agent drew no arrow on the sheet it was meant to; if it drew on another, take that off by hand (the recording is ${recording})`
    )

  const session = sessionFrom(recording)
  return { prompt, cols, rows, events: session.events, editAt: Math.round(editAt - session.start), writes }
}

// The part of a recording that is played: from Claude Code's first screen
// (after the trust question) to the end of its answer (before the driver's
// Ctrl-C), in ms from that first screen, which began at `start`.
export function sessionFrom(recording: string): { start: number; events: [number, string][] } {
  const all = parseRecording(recording)
  const text = all.map(([, chunk]) => strip(chunk))
  const first = text.findIndex((chunk) => /Claude\s*Code\s*v\d/.test(chunk))
  if (first < 0) throw new Error("demo: the recording has no Claude Code screen in it")
  const quit = text.findIndex((chunk, i) => i > first && /Ctrl.?C\s*again/.test(chunk))
  const kept = all.slice(first, quit < 0 ? all.length : quit)
  const start = kept[0][0]
  return { start, events: blankAccountNotices(kept.map(([ms, chunk]) => [Math.round(ms - start), chunk])) }
}

// The arrows the session drew, read off the whiteboard: those there now that
// were not before. Each becomes an edit to make again, with the document it
// holds if it has one.
async function editsSince(mcp: Mcp, whiteboardId: string, before: Set<string>): Promise<AgentRun["writes"]> {
  const board = await mcp("read_whiteboard", { whiteboard_id: whiteboardId })
  type Edge = { id: string; doc_id?: string; doc_type?: string; open_mode?: string } & Record<string, unknown>
  const added = ((board.data.edges as Edge[] | undefined) ?? []).filter((edge) => !before.has(edge.id))
  const writes: AgentRun["writes"] = []
  for (const { id, doc_id, doc_type, ...edge } of added) {
    // Its ends, label, direction and style, as connect_nodes takes them.
    delete edge.open_mode
    writes.push({ name: "connect_nodes", input: { whiteboard_id: whiteboardId, edges: [edge] }, data: { edge_ids: [id] } })
    if (doc_id && doc_type === "text") {
      const document = await mcp("read_text_document", { document_id: doc_id })
      const blocks = (document.data.blocks as { markdown: string }[] | undefined) ?? []
      writes.push({
        name: "attach_document",
        input: { whiteboard_id: whiteboardId, object_id: id, type: "text", markdown: blocks.map((block) => block.markdown).join("\n\n") },
        data: { document_id: doc_id },
      })
    }
  }
  return writes
}

// The whiteboard's arrows, by id.
export async function edgeIds(mcp: Mcp, whiteboardId: string): Promise<Set<string>> {
  const board = await mcp("read_whiteboard", { whiteboard_id: whiteboardId })
  return new Set(((board.data.edges as { id: string }[] | undefined) ?? []).map((edge) => edge.id))
}

// What an edit made, to take away again.
export type Made = { whiteboard_id: string; edge_ids: string[]; document_ids: string[] }

// Makes the session's edits again, in order, mapping the ids its edits got
// to the ones these get. Returns what was made.
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
    for (let attempt = 0; ; attempt++) {
      const present = await edgeIds(mcp, made.whiteboard_id)
      const remaining = made.edge_ids.filter((id) => present.has(id))
      if (!remaining.length) break
      if (attempt === 10) throw new Error(`demo: could not take the agent's arrows off the sheet (${remaining.join(", ")})`)
      await mcp("delete_edges", { whiteboard_id: made.whiteboard_id, edge_ids: remaining })
      await new Promise((done) => setTimeout(done, 1000))
    }
  }
  for (const document_id of made.document_ids) await mcp("trash_document", { document_id })
}

// What the session itself made, from its record.
export const madeBy = (run: AgentRun): Made => ({
  whiteboard_id: String(run.writes[0]?.input.whiteboard_id ?? ""),
  edge_ids: run.writes.flatMap((write) => (write.data.edge_ids as string[] | undefined) ?? []),
  document_ids: run.writes.flatMap((write) => (write.data.document_id ? [String(write.data.document_id)] : [])),
})
