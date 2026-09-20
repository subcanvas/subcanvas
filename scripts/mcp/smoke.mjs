// Drives every tool of the MCP server with a real MCP client, as three
// people: an owner, a viewer of the owner's org, and someone from another
// org. It checks the results and the security model, and leaves a project
// behind to look at in the browser.
//
//   MCP_URL=http://localhost:3000/mcp node --env-file=.env.local scripts/mcp/smoke.mjs \
//     <owner email> <viewer email> <outsider email> <password they share>
//
// Local test accounts only. The viewer must already be a viewer in an org
// the owner owns; the outsider must not be a member of it.
import assert from "node:assert/strict"

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createClient } from "@supabase/supabase-js"

const [ownerEmail, viewerEmail, outsiderEmail, password] = process.argv.slice(2)
const url = new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp")

async function connect(email) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } }
  )
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  assert.equal(error, null, `sign in as ${email}`)
  const client = new Client({ name: "subcanvas-smoke", version: "0.1.0" })
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    })
  )
  return client
}

const used = new Set()
async function call(client, name, args = {}) {
  used.add(name)
  const started = performance.now()
  const result = await client.callTool({ name, arguments: args })
  const ms = Math.round(performance.now() - started)
  const text = result.content?.[0]?.text ?? ""
  console.log(`${result.isError ? "✗" : "✓"} ${name} (${ms} ms) ${text.split("\n")[0].slice(0, 110)}`)
  return result
}
const ok = async (...args) => {
  const result = await call(...args)
  assert.ok(!result.isError, result.content?.[0]?.text)
  return result.structuredContent
}
const refused = async (client, name, args, pattern) => {
  const result = await call(client, name, args)
  assert.ok(result.isError, `${name} should have been refused`)
  assert.match(result.content[0].text, pattern)
}

// No token, and a token that is not one.
for (const headers of [{}, { Authorization: "Bearer not-a-token" }]) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  })
  assert.equal(response.status, 401)
  const challenge = response.headers.get("www-authenticate")
  assert.match(challenge, /^Bearer resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource"/)
  const metadata = await (await fetch(/resource_metadata="([^"]+)"/.exec(challenge)[1])).json()
  assert.equal(metadata.resource, url.href)
  assert.ok(metadata.authorization_servers.length)
  console.log(`✓ 401 with ${headers.Authorization ? "a garbage token" : "no token"}: ${challenge}`)
}

const owner = await connect(ownerEmail)
const viewer = await connect(viewerEmail)
const outsider = await connect(outsiderEmail)
const listed = (await owner.listTools()).tools.map((tool) => tool.name)

const { orgs } = await ok(owner, "list_orgs")
const org = orgs.find((candidate) => candidate.role === "owner")
const { project_id } = await ok(owner, "create_project", { org_id: org.id, name: `MCP smoke ${new Date().toISOString()}` })
await ok(owner, "list_projects", { org_id: org.id })

// The tree.
const { folder_id } = await ok(owner, "create_folder", { project_id, name: "Notes" })
const { document_id: board } = await ok(owner, "create_document", { project_id, type: "whiteboard", title: "System" })
const { document_id: page } = await ok(owner, "create_document", {
  project_id,
  type: "text",
  title: "Design notes",
  place: { kind: "folder", id: folder_id },
  markdown: "# Design notes\n\nWritten by an agent.\n\n- one\n- two\n",
})
await ok(owner, "rename_document", { id: page, name: "Design notes (agent)" })
await ok(owner, "rename_document", { kind: "folder", id: folder_id, name: "Agent notes" })
await ok(owner, "move_document", { id: page, to: { kind: "root" } })
await refused(owner, "delete_folder", { folder_id: "00000000-0000-4000-8000-000000000000" }, /permission|allowed/i)
await ok(owner, "delete_folder", { folder_id })

// Text, by block id.
let read = await ok(owner, "read_text_document", { document_id: page })
assert.deepEqual(read.blocks.map((block) => block.type), ["heading", "paragraph", "bulletListItem", "bulletListItem"])
const paragraph = read.blocks[1].id
const { added_block_ids: appended } = await ok(owner, "append_markdown", { document_id: page, markdown: "## Appendix\n\nLast words." })
await ok(owner, "insert_after_block", { document_id: page, block_id: paragraph, markdown: "Inserted **after** the first paragraph." })
const { added_block_ids: replaced } = await ok(owner, "replace_block", { document_id: page, block_id: paragraph, markdown: "Rewritten by an agent." })
await ok(owner, "delete_block", { document_id: page, block_id: appended[1] })
await refused(owner, "delete_block", { document_id: page, block_id: appended[1] }, /No block with that id/)
read = await ok(owner, "read_text_document", { document_id: page })
assert.deepEqual(
  read.blocks.map((block) => block.markdown),
  ["# Design notes", "Rewritten by an agent.", "Inserted **after** the first paragraph.", "* one", "* two", "## Appendix"]
)
assert.equal(read.blocks[1].id, replaced[0])
assert.equal(read.blocks[0].id, (await ok(owner, "read_text_document", { document_id: page })).blocks[0].id)

// A whiteboard.
const { node_ids } = await ok(owner, "add_nodes", {
  whiteboard_id: board,
  nodes: [
    { title: "Browser", color: "blue" },
    { title: "API", description: "Next.js route handlers" },
    { title: "Postgres", color: "green" },
    { kind: "text", title: "Agent-drawn system" },
  ],
})
const [browser, api, postgres, heading] = node_ids
const { edge_ids } = await ok(owner, "connect_nodes", {
  whiteboard_id: board,
  edges: [
    { source: browser, target: api, label: "HTTPS" },
    { source: api, target: postgres, label: "SQL", stroke: "dotted", direction: "both" },
  ],
})
await ok(owner, "arrange_nodes", { whiteboard_id: board })
const { node_ids: extra } = await ok(owner, "add_nodes", { whiteboard_id: board, nodes: [{ title: "Cache", near_node_id: api }, { title: "Scratch" }] })
await ok(owner, "update_nodes", { whiteboard_id: board, nodes: [{ id: extra[0], title: "Redis cache", color: "red", width: 200 }] })
await ok(owner, "update_edges", { whiteboard_id: board, edges: [{ id: edge_ids[0], label: "HTTPS + JSON", shape: "step" }] })
const { edge_ids: doomedEdges } = await ok(owner, "connect_nodes", { whiteboard_id: board, edges: [{ source: api, target: extra[1] }] })
await ok(owner, "delete_edges", { whiteboard_id: board, edge_ids: doomedEdges })
await ok(owner, "delete_nodes", { whiteboard_id: board, node_ids: [extra[1]] })
const { group_id } = await ok(owner, "create_group", { whiteboard_id: board, title: "Backend", node_ids: [api, postgres] })
await ok(owner, "set_group_membership", { whiteboard_id: board, node_ids: [extra[0]], group_id })
await ok(owner, "set_group_membership", { whiteboard_id: board, node_ids: [extra[0]], group_id: null })
await refused(owner, "update_nodes", { whiteboard_id: board, nodes: [{ id: "nope", title: "x" }] }, /No node with id nope/)

// What nodes and arrows hold.
const { document_id: description } = await ok(owner, "attach_document", {
  whiteboard_id: board, object_id: api, type: "text", markdown: "The API is a set of **route handlers**.",
})
const { document_id: inner } = await ok(owner, "attach_document", { whiteboard_id: board, object_id: postgres, type: "whiteboard" })
await ok(owner, "add_nodes", { whiteboard_id: inner, nodes: [{ title: "documents" }, { title: "document_updates" }] })
await ok(owner, "attach_document", { whiteboard_id: board, object_id: edge_ids[0], existing_document_id: page })
const { document_id: insideBrowser } = await ok(owner, "create_document", {
  project_id, type: "whiteboard", place: { kind: "object", whiteboard_id: board, object_id: browser },
})
await refused(owner, "attach_document", { whiteboard_id: board, object_id: browser, type: "text" }, /already holds/)
assert.deepEqual((await ok(owner, "list_references", { document_id: page })).referenced_by, ["System"])
await ok(owner, "detach_document", { whiteboard_id: board, object_id: edge_ids[0] })
assert.deepEqual((await ok(owner, "list_references", { document_id: page })).referenced_by, [])

const drawn = await ok(owner, "read_whiteboard", { whiteboard_id: board })
assert.equal(drawn.nodes.length, 6)
assert.equal(drawn.edges.length, 2)
assert.equal(drawn.nodes.find((node) => node.id === api).doc_id, description)
assert.equal(drawn.nodes.find((node) => node.id === api).group_id, group_id)
assert.equal(drawn.nodes.find((node) => node.id === browser).doc_id, insideBrowser)
assert.ok(drawn.nodes.find((node) => node.id === heading))
assert.equal((await ok(owner, "read_text_document", { document_id: description })).blocks[0].markdown, "The API is a set of **route handlers**.")

// Trash and back.
const { document_id: doomed } = await ok(owner, "create_document", { project_id, type: "text", title: "Doomed" })
await refused(owner, "delete_document_forever", { document_id: doomed }, /permission/)
await ok(owner, "trash_document", { document_id: doomed })
const trashed = await ok(owner, "get_project", { project_id, include_trash: true })
assert.deepEqual(trashed.trash.map((document) => document.id), [doomed])
await ok(owner, "restore_document", { document_id: doomed })
await ok(owner, "trash_document", { document_id: doomed })
await ok(owner, "delete_document_forever", { document_id: doomed })

// Embeds need a public project.
await refused(owner, "get_embed_snippet", { whiteboard_id: board }, /private/)
await ok(owner, "set_project_visibility", { project_id, visibility: "public" })
const embed = await ok(owner, "get_embed_snippet", { whiteboard_id: board })
assert.equal((await fetch(embed.image_url)).status, 200)
await ok(owner, "set_project_visibility", { project_id, visibility: "private" })

// The importer, against the fixture repository when the server has one.
const imported = await call(owner, "import_github_repository", { org_id: org.id, repository: "fixture/shop" })
if (imported.isError) console.log("  (no fixture repository on this server; the import's other paths are not checked)")
else {
  // A README that came from the repository is read-only, for an agent too.
  const flat = (nodes) => nodes.flatMap((node) => [node, ...flat(node.children)])
  const { tree } = await ok(owner, "get_project", { project_id: imported.structuredContent.project_id })
  const readme = flat(tree).find((node) => node.kind === "document" && node.type === "text")
  await refused(owner, "append_markdown", { document_id: readme.id, markdown: "Agent was here" }, /repository/)
}

// A folder of notes: folders from the paths, a title from the heading, and a
// link between two files that ends up pointing at the new document.
const notes = await ok(owner, "import_markdown_documents", {
  project_id,
  files: [
    { path: "guides/Install.md", markdown: "# Installing\n\nThen read [the tour](./Tour.md)." },
    { path: "guides/Tour.md", markdown: "A tour with no heading of its own." },
  ],
})
assert.equal(notes.documents.length, 2)
assert.equal(notes.folders, 1)
const install = notes.documents.find((document) => document.path === "guides/Install.md")
const tour = notes.documents.find((document) => document.path === "guides/Tour.md")
assert.equal(install.title, "Installing")
assert.equal(tour.title, "Tour")
const installed = await ok(owner, "read_text_document", { document_id: install.document_id })
assert.ok(JSON.stringify(installed).includes(tour.document_id), "the link between the files points at the new document")

// A viewer reads and cannot write, whatever the tool.
await ok(viewer, "get_project", { project_id })
await ok(viewer, "read_whiteboard", { whiteboard_id: board })
await ok(viewer, "read_text_document", { document_id: page })
await refused(viewer, "add_nodes", { whiteboard_id: board, nodes: [{ title: "Viewer was here" }] }, /do not have permission to change/)
await refused(viewer, "append_markdown", { document_id: page, markdown: "Viewer was here" }, /do not have permission to change/)
await refused(viewer, "rename_document", { id: page, name: "Viewer was here" }, /permission/)
await refused(viewer, "create_document", { project_id, type: "text" }, /permission/)
await refused(viewer, "create_project", { org_id: org.id, name: "Viewer was here" }, /permission/)
await refused(viewer, "trash_document", { document_id: page }, /permission/)
await refused(viewer, "set_project_visibility", { project_id, visibility: "public" }, /permission/)
await refused(viewer, "import_github_repository", { org_id: org.id, repository: "fixture/shop" }, /permission/)
await refused(viewer, "import_markdown_documents", { project_id, files: [{ path: "note.md", markdown: "Viewer was here" }] }, /permission/)
assert.equal((await ok(owner, "read_whiteboard", { whiteboard_id: board })).nodes.length, 6)

// Someone from another org sees none of it.
await refused(outsider, "get_project", { project_id }, /No such project/)
await refused(outsider, "list_projects", { org_id: org.id }, /No such org/)
await refused(outsider, "read_whiteboard", { whiteboard_id: board }, /No such document/)
await refused(outsider, "read_text_document", { document_id: page }, /No such document/)
await refused(outsider, "add_nodes", { whiteboard_id: board, nodes: [{ title: "Outsider was here" }] }, /No such document/)
await refused(outsider, "create_document", { project_id, type: "text" }, /No such project/)
assert.ok(!(await ok(outsider, "list_orgs")).orgs.some((candidate) => candidate.id === org.id))

const unused = listed.filter((name) => !used.has(name))
assert.deepEqual(unused, [], "every tool is exercised")
console.log(`\nAll ${listed.length} tools exercised. Project ${project_id}, whiteboard ${board}, text document ${page}.`)
await Promise.all([owner.close(), viewer.close(), outsider.close()])
