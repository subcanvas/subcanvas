import { expect, test, type Page } from "@playwright/test"

import {
  addNode,
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
import { clickCanvas } from "./support/collab"

// Undo and redo on the whiteboard, by key and by button, and inside the text
// a node holds. All of it with real key presses: Playwright sends them
// through the browser, so what the page hears is what a keyboard sends.
// The platform's command key is ⌘ on a Mac and Ctrl elsewhere, which is
// what ControlOrMeta stands for.

// A node fresh from the toolbar is called "Node", the same word as the tool
// that made it, so its label cannot be told from the tool's by text alone.
// Its accessible name can: every node is a group named after its kind and
// title.
const freshNode = (page: Page) =>
  page.getByRole("application").getByRole("group", { name: "Node: Node", exact: true })

// Adds a node from the toolbar and waits for it to be saved before giving it
// a title, so the add and the title are two steps to undo. Yjs merges
// changes made within half a second of each other into one step, and
// "Saved" comes at least a second after the add.
async function addNodeInTwoSteps(page: Page, title: string) {
  await whiteboardTools(page).getByRole("button", { name: "Node", exact: true }).click()
  await expect(freshNode(page)).toBeVisible()
  await expectSaved(page)
  await inspector(page).getByLabel("Title").fill(title)
  await expect(nodeLabelled(page, title)).toBeVisible()
  await expectSaved(page)
}

test("⌘Z takes back the title and then the node; ⇧⌘Z brings them back in order", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const title = `Alpha ${id}`
  await addNodeInTwoSteps(page, title)
  // The focus is still in the panel's Title field, where ⌘Z would be the
  // field's own undo. The canvas has to have it.
  await clickCanvas(page)

  await page.keyboard.press("ControlOrMeta+z")
  await expect(freshNode(page)).toBeVisible()
  await expect(nodeLabelled(page, title)).toHaveCount(0)

  await page.keyboard.press("ControlOrMeta+z")
  // The words the sheet shows when it holds nothing.
  await expect(page.getByText("An empty sheet")).toBeVisible()

  await page.keyboard.press("Shift+ControlOrMeta+z")
  await expect(freshNode(page)).toBeVisible()

  await page.keyboard.press("Shift+ControlOrMeta+z")
  await expect(nodeLabelled(page, title)).toBeVisible()

  // What redo put back is a change like any other, and is saved like one.
  await expectSaved(page)
  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(nodeLabelled(page, title)).toBeVisible()
})

test("the toolbar's Undo and Redo do the same", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const title = `Alpha ${id}`
  await addNodeInTwoSteps(page, title)
  const undo = whiteboardTools(page).getByRole("button", { name: "Undo" })
  const redo = whiteboardTools(page).getByRole("button", { name: "Redo" })

  await undo.click()
  await expect(freshNode(page)).toBeVisible()
  await expect(nodeLabelled(page, title)).toHaveCount(0)

  await undo.click()
  await expect(page.getByText("An empty sheet")).toBeVisible()

  await redo.click()
  await expect(freshNode(page)).toBeVisible()

  await redo.click()
  await expect(nodeLabelled(page, title)).toBeVisible()
})

// Writes in the node's description and returns the editor. Two runs of
// typing with a save between them, so they are two steps to undo (the same
// half-second window as the whiteboard's: the editor's history is a Yjs
// undo manager too).
async function writeTwoRuns(page: Page, first: string, second: string) {
  const panel = inspector(page)
  await panel.getByRole("button", { name: "Write a description…" }).click()
  const editor = nodeDocument(page).getByRole("textbox")
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.type(first)
  await expect(editor).toHaveText(first)
  await expectSaved(nodeDocument(page))
  await page.keyboard.type(second)
  await expect(editor).toHaveText(first + second)
  await expectSaved(nodeDocument(page))
  return editor
}

// There was a report that ⌘Z in the editor did nothing under Playwright. It
// does: the two tests below are the record. What does nothing is redo after
// an undo that left the editor empty, which the last test holds open.
test("⌘Z in a node's text takes back the last run of typing, and ⇧⌘Z brings it back", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  await addNode(page, `Alpha ${id}`)

  const editor = await writeTwoRuns(page, `one ${id}`, ` two ${id}`)

  await page.keyboard.press("ControlOrMeta+z")
  await expect(editor).toHaveText(`one ${id}`)

  await page.keyboard.press("Shift+ControlOrMeta+z")
  await expect(editor).toHaveText(`one ${id} two ${id}`)
})

// Seen on 2026-09-23, with real key presses, in the panel and on a
// full-page text document alike: type into a fresh document, press ⌘Z until
// it is empty, and ⇧⌘Z leaves it empty. As long as some text is left,
// redo works (the test above), so it is the undo that empties the
// editor that kills the redo stack. The why, as far as the page shows it:
// the paragraph a fresh editor opens with is not in Yjs (its block id is
// the editor's own "initialBlockId") and only reaches Yjs with the first
// keystroke. Undoing that leaves the fragment with no block at all, and the
// editor at once writes a fresh empty paragraph into it — the block id on
// screen changes to a new UUID — which is a tracked change, and Yjs's
// UndoManager clears the redo stack on any tracked change that is not
// itself an undo or a redo (yjs/src/utils/UndoManager.js, the
// afterTransaction handler). A redo pressed in the same tick as the undo,
// before that write, still works, which is why a probe can pass by luck;
// nobody types that fast, and waiting for the undo to be saved, as the
// test does, is enough to see the truth.
test("⇧⌘Z after ⌘Z has emptied a node's text brings the text back", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  await addNode(page, `Alpha ${id}`)

  const panel = inspector(page)
  await panel.getByRole("button", { name: "Write a description…" }).click()
  const editor = nodeDocument(page).getByRole("textbox")
  await expect(editor).toBeVisible()
  await editor.click()
  const words = `Typed ${id}`
  await page.keyboard.type(words)
  await expect(editor).toHaveText(words)
  await expectSaved(nodeDocument(page))

  await page.keyboard.press("ControlOrMeta+z")
  await expect(editor).toHaveText("")
  // The undo is a change like any other, and is saved like one.
  await expectSaved(nodeDocument(page))

  await page.keyboard.press("Shift+ControlOrMeta+z")
  await expect(editor).toHaveText(words)
})
