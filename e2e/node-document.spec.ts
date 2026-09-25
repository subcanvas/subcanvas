import { expect, test } from "@playwright/test"

import {
  addNode,
  clickNode,
  closePanel,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  nodeDocument,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { nodeNamed } from "./support/canvas"

test("a description written on a node saves, and is there on the way back", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const nodeTitle = `Alpha ${id}`
  await addNode(page, nodeTitle)

  // The panel offers a description before anything holds one.
  const panel = inspector(page)
  await panel.getByRole("button", { name: "Write a description…" }).click()

  // BlockNote's editor is a contenteditable, so it is the panel's other
  // textbox: the first is the node's Title.
  const editor = nodeDocument(page).getByRole("textbox")
  await expect(editor).toBeVisible()
  await editor.click()
  const words = `The description of ${id}`
  await page.keyboard.type(words)
  await expect(editor).toContainText(words)

  // The badge beside the text is the document's own, not the whiteboard's.
  await expectSaved(nodeDocument(page))

  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()

  // Nothing is selected after a reload, so the panel is closed. Press the
  // node to bring it back.
  await clickNode(page, nodeTitle)
  await expect(panel).toBeVisible()
  await expect(nodeDocument(page).getByRole("textbox")).toContainText(words)
})

test("the mark on a node with a description opens it in the panel", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const nodeTitle = `Alpha ${id}`
  await addNode(page, nodeTitle)
  await inspector(page).getByRole("button", { name: "Write a description…" }).click()
  const editor = nodeDocument(page).getByRole("textbox")
  await editor.click()
  const words = `The description of ${id}`
  await page.keyboard.type(words)
  await expectSaved(nodeDocument(page))
  await closePanel(page)

  // The mark takes the way in the node is set to: here, the panel, which
  // opens on the node with its text.
  await nodeNamed(page, nodeTitle, "a document").getByRole("button", { name: "Open the document inside" }).click()
  await expect(inspector(page)).toBeVisible()
  await expect(nodeDocument(page).getByRole("textbox")).toContainText(words)
})
