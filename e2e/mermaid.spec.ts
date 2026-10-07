import { expect, test, type Page } from "@playwright/test"

import { addNode, createProject, createWhiteboard, freshId, signUpWithOrg } from "./support/app"
import { boxOf, contains, disjoint, edgeBetween, expectBoardSaved, groupNamed, nodeNamed } from "./support/canvas"
import { callTool, connectThroughOAuth, OAUTH_SERVER_OFF, oauthServerEnabled, refusedTool } from "./support/mcp"
import { bringIn, pageEditor, treeLink } from "./support/import"

// Mermaid becomes a whiteboard of real boxes and arrows: pasted in the
// tree's menu, pasted on an open whiteboard, drawn from a code block in a
// page, and written by an agent. docs/IMPORTING.md says what is drawn.

const ARCHITECTURE = `---
title: Checkout
---
flowchart LR
    subgraph Client
        Web[Web app]
    end
    subgraph Backend
        API[API gateway] --> Orders(Order service)
    end
    Web -->|HTTPS| API
    Orders -->|writes| DB[(Orders DB)]
    Orders -.-> Queue{{Events}}
    classDef hot fill:#f96
`

// Pasted the way the browser delivers it: a ClipboardEvent carrying text,
// on the page with nothing focused, as after a click on the canvas.
async function pasteText(page: Page, text: string) {
  await page.evaluate((pasted) => {
    const data = new DataTransfer()
    data.setData("text/plain", pasted)
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

test("Paste Mermaid makes a whiteboard of boxes, groups and arrows, laid out the way the diagram flows", async ({
  page,
}) => {
  await signUpWithOrg(page)
  await createProject(page, "Diagrams")

  await bringIn(page, "Paste Mermaid…")
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Mermaid" }).fill(ARCHITECTURE)
  // What will be drawn, and what will not, before anything is made.
  await expect(dialog.getByRole("status")).toContainText("A flowchart named “Checkout”: 5 boxes in 2 groups and 4 arrows.")
  await expect(dialog.getByRole("list", { name: "Not drawn as written" })).toContainText("Styles and classes")
  await dialog.getByRole("button", { name: "Create whiteboard" }).click()

  await expect(page.getByLabel("Document title")).toHaveValue("Checkout")
  await expect(treeLink(page, "Checkout")).toBeVisible()
  for (const title of ["Web app", "API gateway", "Order service", "Orders DB", "Events"])
    await expect(nodeNamed(page, title)).toBeVisible()
  await expect(edgeBetween(page, "Web app", "API gateway", "labelled HTTPS")).toBeAttached()
  await expect(edgeBetween(page, "Order service", "Orders DB", "labelled writes")).toBeAttached()
  await expect(edgeBetween(page, "API gateway", "Order service")).toBeAttached()
  await expect(edgeBetween(page, "Order service", "Events")).toBeAttached()

  // Subgraphs are groups around their boxes, and the diagram reads left to
  // right with nothing on top of anything else.
  const web = await boxOf(nodeNamed(page, "Web app"))
  const api = await boxOf(nodeNamed(page, "API gateway"))
  const orders = await boxOf(nodeNamed(page, "Order service"))
  const db = await boxOf(nodeNamed(page, "Orders DB"))
  expect(contains(await boxOf(groupNamed(page, "Client")), web)).toBe(true)
  const backend = await boxOf(groupNamed(page, "Backend"))
  expect(contains(backend, api) && contains(backend, orders)).toBe(true)
  expect(web.x + web.width).toBeLessThan(api.x)
  expect(orders.x + orders.width).toBeLessThan(db.x)
  const boxes = [web, api, orders, db, await boxOf(nodeNamed(page, "Events"))]
  for (const [index, box] of boxes.entries())
    for (const other of boxes.slice(index + 1)) expect(disjoint(box, other)).toBe(true)
})

test("Mermaid pasted on a whiteboard is offered, drawn beside what is there, and undone in one step", async ({
  page,
}) => {
  await signUpWithOrg(page)
  await createProject(page, "Data")
  await createWhiteboard(page, "Model")
  await addNode(page, "Already here")
  await expectBoardSaved(page)
  await page.getByRole("application").click({ position: { x: 40, y: 400 } })

  await pasteText(
    page,
    "```mermaid\nerDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    string name\n    int id PK\n  }\n```"
  )
  const dialog = page.getByRole("dialog", { name: "Add this Mermaid diagram?" })
  await expect(dialog.getByRole("status")).toContainText("An ER diagram: 2 boxes and 1 arrow.")
  await dialog.getByRole("button", { name: "Add to whiteboard" }).click()
  await expect(dialog).toBeHidden()

  // The entity with attributes holds them as a page; the other holds nothing.
  await expect(nodeNamed(page, "CUSTOMER", "a document")).toBeVisible()
  await expect(nodeNamed(page, "ORDER")).toBeVisible()
  await expect(edgeBetween(page, "CUSTOMER", "ORDER", "labelled places (1 to 0..*)")).toBeAttached()
  const here = await boxOf(nodeNamed(page, "Already here"))
  expect(disjoint(here, await boxOf(nodeNamed(page, "CUSTOMER", "a document")))).toBe(true)
  expect(disjoint(here, await boxOf(nodeNamed(page, "ORDER")))).toBe(true)

  // The attributes, in the box's page.
  await nodeNamed(page, "CUSTOMER", "a document").getByRole("button", { name: "Open the document inside" }).click()
  const panel = page.getByRole("complementary", { name: "Object settings" })
  await expect(panel.getByRole("cell", { name: "name", exact: true })).toBeVisible()
  await expect(panel.getByRole("cell", { name: "PK" })).toBeVisible()
  await panel.getByRole("button", { name: "Close panel" }).click()

  // One undo takes the whole diagram away, and leaves what was there.
  await page.keyboard.press("ControlOrMeta+z")
  await expect(nodeNamed(page, "ORDER")).toBeHidden()
  await expect(nodeNamed(page, "CUSTOMER", "a document")).toBeHidden()
  await expect(nodeNamed(page, "Already here")).toBeVisible()

  // Text that only starts like Mermaid is not offered.
  await pasteText(page, "graph theory says a tree with n nodes has n-1 edges")
  await expect(page.getByRole("dialog")).toBeHidden()
})

test("a Mermaid code block in a page stays code, and its block menu draws it as a whiteboard inside the page", async ({
  page,
}) => {
  await signUpWithOrg(page)
  await createProject(page, "Docs")

  await bringIn(page, "Paste Markdown…")
  await page
    .getByRole("textbox", { name: "Markdown" })
    .fill("# Login\n\nHow signing in works.\n\n```mermaid\nsequenceDiagram\n  Browser->>Server: POST /login\n  Server-->>Browser: Set-Cookie\n```\n")
  await page.getByRole("button", { name: "Create page" }).click()
  await expect(page.getByLabel("Document title")).toHaveValue("Login")

  const code = pageEditor(page).locator('[data-content-type="codeBlock"]')
  await expect(code).toContainText("Browser->>Server: POST /login")
  await code.hover()
  await page.getByRole("button", { name: "Open block menu" }).click()
  await page.getByRole("menuitem", { name: "Draw as a whiteboard" }).click()

  // The code stays, with a link to the whiteboard under it.
  await expect(page.getByText("Drawn as a whiteboard inside this page.")).toBeVisible()
  await expect(code).toContainText("Browser->>Server: POST /login")
  const card = pageEditor(page).locator('[data-content-type="documentLink"]')
  await expect(card).toContainText("Sequence diagram")
  await card.getByRole("link").click()
  await expect(nodeNamed(page, "Browser")).toBeVisible()
  await expect(edgeBetween(page, "Browser", "Server", "labelled 1. POST /login")).toBeAttached()
  await expect(edgeBetween(page, "Server", "Browser", "labelled 2. Set-Cookie")).toBeAttached()
})

test("an agent draws Mermaid with import_mermaid, as a new whiteboard or beside what is on one", async ({
  page,
  baseURL,
}) => {
  const { account } = await signUpWithOrg(page)
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)
  const { client } = await connectThroughOAuth(page, { baseURL: baseURL!, email: account.email, decision: "approve" })
  if (!client) throw new Error("No client after approval")

  const { workspaces } = (await callTool(client, "list_workspaces")) as { workspaces: { id: string; personal: boolean }[] }
  const id = freshId()
  const { project_id } = (await callTool(client, "create_project", {
    workspace_id: workspaces.find((workspace) => !workspace.personal)!.id,
    name: `Agent diagrams ${id}`,
  })) as { project_id: string }

  const created = (await callTool(client, "import_mermaid", {
    project_id,
    mermaid: "flowchart TD\n  A[Request] --> B{Cached?}\n  B -->|yes| C[Serve]\n  B -->|no| D[(Origin)]\n  style A fill:#f9f",
  })) as { whiteboard_id: string; url: string; node_ids: Record<string, string>; boxes: number; arrows: number; notes: string[] }
  expect(created).toMatchObject({ boxes: 4, arrows: 3 })
  expect(Object.keys(created.node_ids).sort()).toEqual(["A", "B", "C", "D"])
  expect(created.notes.join(" ")).toMatch(/Styles/)

  const added = (await callTool(client, "import_mermaid", {
    whiteboard_id: created.whiteboard_id,
    mermaid: "sequenceDiagram\n  actor User\n  User->>App: Open\n  App-->>User: Page",
  })) as { boxes: number; arrows: number }
  expect(added).toMatchObject({ boxes: 2, arrows: 2 })

  const board = (await callTool(client, "read_whiteboard", { whiteboard_id: created.whiteboard_id })) as {
    title: string
    nodes: { id: string; title: string; shape?: string; icon?: string; x: number; y: number; width: number }[]
    edges: { source: string; target: string; label?: string }[]
  }
  expect(board.title).toBe("Flowchart")
  expect(board.nodes.map((node) => node.title).sort()).toEqual(["App", "Cached?", "Origin", "Request", "Serve", "User"])
  const byTitle = Object.fromEntries(board.nodes.map((node) => [node.title, node]))
  expect(byTitle["Cached?"].shape).toBe("diamond")
  expect(byTitle.Origin.shape).toBe("cylinder")
  expect(byTitle.User.icon).toBe("user")
  // The sequence diagram went beside the flowchart, not on top of it.
  const flowchartRight = Math.max(...["Request", "Cached?", "Serve", "Origin"].map((title) => byTitle[title].x + byTitle[title].width))
  expect(byTitle.User.x).toBeGreaterThan(flowchartRight)
  expect(board.edges.map((edge) => edge.label).filter(Boolean).sort()).toEqual(["1. Open", "2. Page", "no", "yes"])

  expect(await refusedTool(client, "import_mermaid", { project_id, mermaid: "pie\n  \"Dogs\" : 3" })).toMatch(/pie chart/)
  expect(
    await refusedTool(client, "import_mermaid", { project_id, whiteboard_id: created.whiteboard_id, mermaid: "graph LR\n A-->B" })
  ).toMatch(/either/)

  // What the agent drew is an ordinary whiteboard to the person.
  await page.goto(created.url)
  await expect(nodeNamed(page, "Cached?")).toBeVisible()
  await expect(edgeBetween(page, "Cached?", "Serve", "labelled yes")).toBeAttached()
})
