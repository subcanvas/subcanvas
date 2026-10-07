import { expect, test } from "@playwright/test"

import { freshId, signUpWithOrg } from "./support/app"
import { callTool, connectThroughOAuth, OAUTH_SERVER_OFF, oauthServerEnabled, refusedTool } from "./support/mcp"

// An agent sees the trash as the app does: what is inside a trashed folder
// is in the trash too, and a document a node lets go of stays put.

test("an agent treats what is inside a trashed folder as in the trash", async ({ page, baseURL }) => {
  const { account } = await signUpWithOrg(page)
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)
  const { client } = await connectThroughOAuth(page, { baseURL: baseURL!, email: account.email, decision: "approve" })
  if (!client) throw new Error("No client after approval")

  const { workspaces } = (await callTool(client, "list_workspaces")) as { workspaces: { id: string; personal: boolean }[] }
  const team = workspaces.find((workspace) => !workspace.personal)!.id
  const id = freshId()
  const { project_id } = (await callTool(client, "create_project", { workspace_id: team, name: `Trash ${id}` })) as {
    project_id: string
  }
  const { folder_id } = (await callTool(client, "create_folder", { project_id, name: "Plans" })) as { folder_id: string }
  const { document_id: roadmap } = (await callTool(client, "create_document", {
    project_id,
    type: "text",
    title: "Roadmap",
    place: { kind: "folder", id: folder_id },
    markdown: "Ship it.",
  })) as { document_id: string }
  const { document_id: board } = (await callTool(client, "create_document", {
    project_id,
    type: "whiteboard",
    title: "Board",
    place: { kind: "document", id: roadmap },
  })) as { document_id: string }
  await callTool(client, "create_document", { project_id, type: "text", title: "Overview" })

  await callTool(client, "trash_document", { kind: "folder", id: folder_id })

  // Counted as the project cards count.
  const { projects } = (await callTool(client, "list_projects", { workspace_id: team })) as {
    projects: { id: string; documents: number }[]
  }
  expect(projects.find((project) => project.id === project_id)?.documents).toBe(1)

  // Nothing new goes into it.
  expect(
    await refusedTool(client, "create_document", { project_id, type: "text", place: { kind: "folder", id: folder_id } })
  ).toMatch(/in the trash/)
  expect(
    await refusedTool(client, "create_document", { project_id, type: "text", place: { kind: "document", id: roadmap } })
  ).toMatch(/in the trash/)
  expect(await refusedTool(client, "create_folder", { project_id, parent_folder_id: folder_id })).toMatch(/in the trash/)
  expect(
    await refusedTool(client, "import_markdown_documents", {
      project_id,
      place: { kind: "folder", id: folder_id },
      files: [{ path: "a.md", markdown: "# A" }],
    })
  ).toMatch(/in the trash/)

  // Reads say so, and changes are refused.
  const read = await client.callTool({ name: "read_text_document", arguments: { document_id: roadmap } })
  expect(read.isError).toBeFalsy()
  expect((read.structuredContent as { in_trash: boolean }).in_trash).toBe(true)
  expect(await refusedTool(client, "append_markdown", { document_id: roadmap, markdown: "More." })).toMatch(/in the trash/)
  expect(await refusedTool(client, "add_nodes", { whiteboard_id: board, nodes: [{ title: "Box" }] })).toMatch(/in the trash/)

  // What is only inside the trash is restored with what holds it.
  expect(await refusedTool(client, "restore_document", { id: roadmap })).toMatch(/not in the trash itself/)
  await callTool(client, "restore_document", { kind: "folder", id: folder_id })
  await callTool(client, "append_markdown", { document_id: roadmap, markdown: "More." })
  await client.close()
})

test("a document an agent detaches from a node stays when the node is deleted", async ({ page, baseURL }) => {
  const { account } = await signUpWithOrg(page)
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)
  const { client } = await connectThroughOAuth(page, { baseURL: baseURL!, email: account.email, decision: "approve" })
  if (!client) throw new Error("No client after approval")

  const { workspaces } = (await callTool(client, "list_workspaces")) as { workspaces: { id: string; personal: boolean }[] }
  const team = workspaces.find((workspace) => !workspace.personal)!.id
  const { project_id } = (await callTool(client, "create_project", { workspace_id: team, name: `Detach ${freshId()}` })) as {
    project_id: string
  }
  const { document_id: board } = (await callTool(client, "create_document", { project_id, type: "whiteboard", title: "Board" })) as {
    document_id: string
  }
  const { node_ids } = (await callTool(client, "add_nodes", {
    whiteboard_id: board,
    nodes: [{ title: "Service" }, { title: "Notes" }],
  })) as { node_ids: string[] }
  const { document_id: inner } = (await callTool(client, "attach_document", {
    whiteboard_id: board,
    object_id: node_ids[0],
    type: "whiteboard",
  })) as { document_id: string }
  const { document_id: notes } = (await callTool(client, "attach_document", {
    whiteboard_id: board,
    object_id: node_ids[1],
    type: "text",
    markdown: "Kept.",
  })) as { document_id: string }

  for (const node of node_ids) {
    const detached = await client.callTool({ name: "detach_document", arguments: { whiteboard_id: board, object_id: node } })
    expect(detached.isError).toBeFalsy()
    expect(JSON.stringify(detached.content)).toMatch(/of its own under this whiteboard/)
  }
  const deleted = (await callTool(client, "delete_nodes", { whiteboard_id: board, node_ids })) as {
    trashed_document_ids: string[]
  }
  expect(deleted.trashed_document_ids).toEqual([])

  // Both are in the tree under the whiteboard, the description as a page.
  const { tree } = (await callTool(client, "get_project", { project_id })) as {
    tree: { id: string; children: { id: string }[] }[]
  }
  const under = tree.find((node) => node.id === board)?.children.map((child) => child.id)
  expect(under?.sort()).toEqual([inner, notes].sort())
  await client.close()
})
