import { expect, test } from "@playwright/test"

import {
  addNode,
  breadcrumb,
  clickNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  nodeDocument,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import {
  addTwoNodesApart,
  clickEdge,
  connectNodes,
  createWhiteboardInside,
  edgeBetween,
  expectBoardSaved,
  nodeNamed,
  openInside,
} from "./support/canvas"

// A node can hold a whole whiteboard (R4.1), which is reached by
// double-clicking the node (R4.7) and left along the trail of sheets (R2.1).
test("a whiteboard inside a node is reached by double-click and left by the trail", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const outer = `Outer ${id}`
  await addNode(page, outer)
  await createWhiteboardInside(page)
  // The link from the node to its whiteboard is content of the outer board.
  await expectSaved(page)

  // The new whiteboard is a document of the project: it shows in the tree,
  // under the board it lives in (R2.4), once the board is opened up there.
  // It is named after its node.
  await page.getByRole("button", { name: "Expand Board" }).click()
  await expect(page.getByRole("link", { name: outer, exact: true })).toBeVisible()

  await openInside(page, outer)

  // The trail is the way in: the project, the board, and this sheet.
  await expect(breadcrumb(page)).toHaveText(new RegExp(`Proj.*Board.*${outer}`))
  await expect(breadcrumb(page).getByRole("link", { name: "Board", exact: true })).toBeVisible()

  // Inside is an empty sheet of its own, and it takes nodes.
  const inner = `Inner ${id}`
  await addNode(page, inner)
  await expectSaved(page)

  // Back out through the trail.
  await breadcrumb(page).getByRole("link", { name: "Board", exact: true }).click()
  await page.waitForURL((url) => !url.searchParams.has("via"))
  await expect(whiteboardTools(page)).toBeVisible()

  // The inner node stayed inside: the outer board never shows it.
  await expect(nodeLabelled(page, inner)).toHaveCount(0)

  // The outer node now says what it holds, in its name for a screen reader
  // and as the mark that opens it. On screen it is the stack of sheets.
  await expect(nodeNamed(page, outer, "a whiteboard")).toBeVisible()
  await expect(nodeNamed(page, outer, "a whiteboard").getByRole("button", { name: "Open the whiteboard inside" })).toBeVisible()

  // And the inside was saved: go in again and the inner node is there.
  await openInside(page, outer)
  await expect(nodeLabelled(page, inner)).toBeVisible()
})

test("sheets nest two levels deep, and the trail leads back through each", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const outer = `Outer ${id}`
  await addNode(page, outer)
  await createWhiteboardInside(page)
  await expectSaved(page)
  await openInside(page, outer)

  const deeper = `Deeper ${id}`
  await addNode(page, deeper)
  await createWhiteboardInside(page)
  await expectSaved(page)
  await openInside(page, deeper)

  // Two sheets in, the trail has every step.
  await expect(breadcrumb(page)).toHaveText(new RegExp(`Proj.*Board.*${outer}.*${deeper}`))

  const deepest = `Deepest ${id}`
  await addNode(page, deepest)
  await expectSaved(page)

  // One step back: the middle sheet, still reached by way of the board.
  await breadcrumb(page).getByRole("link", { name: outer, exact: true }).click()
  await page.waitForURL(/via=/)
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(nodeNamed(page, deeper, "a whiteboard")).toBeVisible()
  await expect(nodeLabelled(page, deepest)).toHaveCount(0)
  await expect(breadcrumb(page)).toHaveText(new RegExp(`Proj.*Board.*${outer}`))

  // And all the way out.
  await breadcrumb(page).getByRole("link", { name: "Board", exact: true }).click()
  await page.waitForURL((url) => !url.searchParams.has("via"))
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(nodeNamed(page, outer, "a whiteboard")).toBeVisible()
  await expect(nodeLabelled(page, deeper)).toHaveCount(0)

  // The tree shows the nesting as it is: each whiteboard under the one it
  // lives in, opened up level by level.
  await page.getByRole("button", { name: "Expand Board" }).click()
  await expect(page.getByRole("link", { name: outer, exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: deeper, exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: `Expand ${outer}` }).click()
  await expect(page.getByRole("link", { name: deeper, exact: true })).toBeVisible()
})

// An edge is an object like a node (R4.1): it holds a document of its own.
test("an arrow holds a document, written in the panel and there after a reload", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const alpha = `Alpha ${id}`
  const beta = `Beta ${id}`
  await addTwoNodesApart(page, alpha, beta)
  await connectNodes(page, alpha, beta)

  await clickEdge(page, alpha, beta)
  const panel = inspector(page)
  await panel.getByRole("button", { name: "Write a description…" }).click()
  // The arrow's link to its new document is content of the whiteboard.
  await expectBoardSaved(page)

  const editor = nodeDocument(page).getByRole("textbox")
  await expect(editor).toBeVisible()
  await editor.click()
  const words = `Why ${alpha} leads to ${beta}`
  await page.keyboard.type(words)
  await expect(editor).toContainText(words)
  await expectSaved(nodeDocument(page))

  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()

  // The arrow says it holds a document now, and opening it shows the words.
  await expect(edgeBetween(page, alpha, beta, "holds a document")).toBeVisible()
  await clickEdge(page, alpha, beta)
  await expect(nodeDocument(page).getByRole("textbox")).toContainText(words)

  // The nodes are untouched by any of it.
  await clickNode(page, alpha)
  await expect(panel.getByLabel("Title")).toHaveValue(alpha)
})
