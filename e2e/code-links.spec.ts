import { expect, test, type Page } from "@playwright/test"

import {
  addNode,
  clickNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { edgeBetween } from "./support/canvas"
import { callTool, connectThroughOAuth, OAUTH_SERVER_OFF, oauthServerEnabled, refusedTool } from "./support/mcp"

// Code links: a node or an arrow points at the code behind it, and a click
// on its code mark opens that code in a new tab (REQUIREMENTS.md, R4.11).

const FILE = "https://github.com/acme/shop/blob/main/services/payments/charge.ts#L10-L20"
const FILE_NAME = "Open code: services/payments/charge.ts:10-20 in acme/shop (opens in a new tab)"

const canvas = (page: Page) => page.getByRole("application")
const modeToggle = (page: Page) => page.getByRole("group", { name: "Whiteboard mode" })

// GitHub is not asked: a tab that opens there gets a page from here.
async function answerForGitHub(page: Page) {
  await page.context().route("https://github.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>The code</title>" })
  )
}

test("a code link is added in the panel, kept, opened from the node, and removed", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  await answerForGitHub(page)

  const title = `Charge ${id}`
  await addNode(page, title)
  const panel = inspector(page)
  const field = panel.getByRole("textbox", { name: "Code" })

  // Only an https address is taken, and the field says why.
  await field.fill("http://github.com/acme/shop")
  await field.press("Enter")
  await expect(panel.getByRole("alert")).toHaveText("Only https links can be added.")
  await expect(field).toHaveAttribute("aria-invalid", "true")
  await expect(canvas(page).getByRole("link", { name: /^Open code/ })).toHaveCount(0)

  // An address without its scheme means https. Nothing is written until it
  // is finished, then the node wears the code mark and the panel names it.
  await field.fill(FILE.replace("https://", ""))
  await expect(canvas(page).getByRole("link", { name: /^Open code/ })).toHaveCount(0)
  await field.press("Enter")
  await expect(field).toHaveValue(FILE)
  await expect(panel.getByRole("alert")).toHaveCount(0)
  await expect(panel.getByRole("link", { name: FILE_NAME })).toHaveAttribute("href", FILE)
  const mark = canvas(page).getByRole("link", { name: FILE_NAME })
  await expect(mark).toHaveAttribute("href", FILE)
  await expectSaved(page)

  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(mark).toHaveAttribute("href", FILE)

  // The mark opens the code in a new tab, and leaves the node as it was.
  const [tab] = await Promise.all([page.waitForEvent("popup"), mark.click()])
  await expect(tab).toHaveURL(FILE)
  await tab.close()
  await expect(panel).toBeHidden()

  // In view mode the link is still there to open, and not to change.
  await modeToggle(page).getByRole("button", { name: "View mode" }).click()
  await clickNode(page, title)
  await expect(panel.getByRole("link", { name: FILE_NAME })).toBeVisible()
  await expect(panel.getByRole("textbox", { name: "Code" })).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "Remove the code link" })).toHaveCount(0)
  const [fromPanel] = await Promise.all([page.waitForEvent("popup"), panel.getByRole("link", { name: FILE_NAME }).click()])
  await expect(fromPanel).toHaveURL(FILE)
  await fromPanel.close()

  // Back to editing: removing it takes the mark off the node.
  await modeToggle(page).getByRole("button", { name: "Edit mode" }).click()
  await clickNode(page, title)
  await panel.getByRole("button", { name: "Remove the code link" }).click()
  await expect(field).toHaveValue("")
  await expect(mark).toHaveCount(0)
  await expectSaved(page)

  // And undo puts it back.
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z")
  await expect(mark).toHaveAttribute("href", FILE)
})

test("an agent links a node and an arrow to code, reads the links back, and people see them", async ({
  page,
  baseURL,
}) => {
  const { account, slug } = await signUpWithOrg(page)
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)
  await answerForGitHub(page)

  const { client } = await connectThroughOAuth(page, { baseURL: baseURL!, email: account.email, decision: "approve" })
  if (!client) throw new Error("No client after approval")
  const { workspaces } = (await callTool(client, "list_workspaces")) as { workspaces: { id: string; slug: string }[] }
  const workspace = workspaces.find((candidate) => candidate.slug === slug)!

  const id = freshId()
  const { project_id } = (await callTool(client, "create_project", { workspace_id: workspace.id, name: `Code ${id}` })) as {
    project_id: string
  }
  const { document_id: board } = (await callTool(client, "create_document", {
    project_id,
    type: "whiteboard",
    title: `Payments ${id}`,
  })) as { document_id: string }

  const CALL = "https://github.com/acme/shop/blob/main/services/payments/charge.ts#L42"
  const { node_ids } = (await callTool(client, "add_nodes", {
    whiteboard_id: board,
    nodes: [
      { title: "Charge", code_url: FILE },
      { title: "Ledger", x: 400, y: 0 },
    ],
  })) as { node_ids: string[] }
  const { edge_ids } = (await callTool(client, "connect_nodes", {
    whiteboard_id: board,
    edges: [{ source: node_ids[0], target: node_ids[1], label: "posts", code_url: CALL }],
  })) as { edge_ids: string[] }

  // Changing something else keeps the link; a link that is not https is
  // refused.
  await callTool(client, "update_nodes", { whiteboard_id: board, nodes: [{ id: node_ids[0], title: "Charges" }] })
  expect(
    await refusedTool(client, "update_nodes", { whiteboard_id: board, nodes: [{ id: node_ids[1], code_url: "http://example.com" }] })
  ).toMatch(/https/)

  const read = (await callTool(client, "read_whiteboard", { whiteboard_id: board })) as {
    url: string
    nodes: { id: string; title: string; code_url?: string; code_url_from_folder?: boolean }[]
    edges: { id: string; code_url?: string }[]
  }
  expect(read.nodes.find((node) => node.id === node_ids[0])).toMatchObject({ title: "Charges", code_url: FILE })
  expect(read.nodes.find((node) => node.id === node_ids[0])).not.toHaveProperty("code_url_from_folder")
  expect(read.nodes.find((node) => node.id === node_ids[1])).not.toHaveProperty("code_url")
  expect(read.edges).toEqual([expect.objectContaining({ id: edge_ids[0], code_url: CALL })])
  await client.close()

  // In the app: the node's mark and the arrow's, each to its own address.
  await page.goto(read.url)
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(canvas(page).getByRole("link", { name: FILE_NAME })).toHaveAttribute("href", FILE)
  const arrowMark = canvas(page).getByRole("link", {
    name: "Open code: services/payments/charge.ts:42 in acme/shop (opens in a new tab)",
  })
  await expect(arrowMark).toHaveAttribute("href", CALL)
  await expect(edgeBetween(page, "Charges", "Ledger")).toHaveCount(1)
  const [tab] = await Promise.all([page.waitForEvent("popup"), arrowMark.click()])
  await expect(tab).toHaveURL(CALL)
})
