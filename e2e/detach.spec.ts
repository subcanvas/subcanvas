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
} from "./support/app"
import { nodeNamed } from "./support/canvas"

// Detach lets go of what a box holds. The whiteboard inside it, or its
// description, stays in the project as a document of its own, in the tree
// under the whiteboard the box is on, and deleting the box afterwards
// deletes the box and nothing else (box-trash.spec.ts has what a box that
// still holds something takes with it).

// A document's row in the sidebar tree is a link to it.
const treeRow = (page: Page, name: string) => page.getByRole("link", { name, exact: true, disabled: false })

// Its chevron shows once it holds something, which a click waits for.
// Expanded, it stays so while the page is open.
async function expandInTree(page: Page, name: string) {
  await page.getByRole("button", { name: `Expand ${name}` }).click()
  await expect(page.getByRole("button", { name: `Collapse ${name}` })).toBeVisible()
}

async function openTrash(page: Page) {
  await page.getByRole("button", { name: "Project menu" }).click()
  await page.getByRole("menuitem", { name: "Trash" }).click()
  await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible()
}

// Detaching says where the document went. It says so once the document has
// been let go of, so a box deleted after that takes nothing with it.
async function detach(page: Page) {
  await inspector(page).getByRole("button", { name: "Detach" }).click()
  await expect(page.getByText(/under this whiteboard/i).first()).toBeVisible()
}

test("detaching a box's whiteboard lets go of it", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  const top = `Top ${id}`
  await createWhiteboard(page, top)
  const board = page.url()

  const inner = `Payments ${id}`
  await addNode(page, inner)
  await inspector(page).getByRole("button", { name: "New whiteboard inside" }).click()
  await expect(inspector(page).getByText("A whiteboard. Click to go inside.")).toBeVisible()
  await expandInTree(page, top)
  await expect(treeRow(page, inner)).toBeVisible()
  await expectSaved(page)

  // The box holds nothing now; the whiteboard stays where it was in the tree.
  await detach(page)
  await expect(inspector(page).getByRole("button", { name: "New whiteboard inside" })).toBeVisible()
  await expect(nodeNamed(page, inner)).toBeVisible()
  await expect(treeRow(page, inner)).toBeVisible()

  // Deleting the box sends nothing to the trash. What a deleted box held is
  // trashed the moment it goes, and the board saves only after a pause, so
  // by the time it has saved, the toast would be up if anything had gone.
  await inspector(page).getByRole("button", { name: "Delete box" }).click()
  await expect(nodeLabelled(page, inner)).toHaveCount(0)
  await expectSaved(page)
  await expect(page.getByText(`“${inner}” is in the trash`)).toHaveCount(0)

  // And from the database, not only this page's memory of it.
  await page.goto(board)
  await expandInTree(page, top)
  await expect(treeRow(page, inner)).toBeVisible()
  await openTrash(page)
  await expect(page.getByText("The trash is empty.")).toBeVisible()
})

test("a detached description is a page under the whiteboard, and outlives its box", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  const top = `Top ${id}`
  await createWhiteboard(page, top)
  const board = page.url()

  const box = `API ${id}`
  await addNode(page, box)
  await inspector(page).getByRole("button", { name: "Write a description…" }).click()
  const editor = nodeDocument(page).getByRole("textbox")
  await editor.click()
  await page.keyboard.type("Rate limited per key.")
  await expectSaved(nodeDocument(page))

  // A description is in no tree. Detached, it is a page named after its
  // box, under the whiteboard, and the box can take a new one.
  await detach(page)
  await expect(inspector(page).getByRole("button", { name: "Write a description…" })).toBeVisible()
  await expandInTree(page, top)
  await expect(treeRow(page, box)).toBeVisible()

  await inspector(page).getByRole("button", { name: "Delete box" }).click()
  await expect(nodeLabelled(page, box)).toHaveCount(0)
  await expectSaved(page)
  await expect(page.getByText(`“${box}” is in the trash`)).toHaveCount(0)

  // Still a page after a reload, with what was written in it.
  await page.goto(board)
  await expandInTree(page, top)
  await treeRow(page, box).click()
  await expect(page.getByLabel("Document title")).toHaveValue(box)
  await expect(page.getByText("Rate limited per key.")).toBeVisible()
  await openTrash(page)
  await expect(page.getByText("The trash is empty.")).toBeVisible()
})
