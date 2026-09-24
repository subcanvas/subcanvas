import { expect, test, type Page } from "@playwright/test"

import {
  addNode,
  createProject,
  createWhiteboard,
  freshId,
  inspector,
  signUpWithOrg,
} from "./support/app"
import { expectBoardSaved } from "./support/canvas"

// The project tree in the sidebar (R2.4): folders, documents in them, and
// the trash they go to. The tree is the same component on every page of the
// project, so what is expanded stays expanded across navigation.

// Adds a folder at the project root. A new folder opens for renaming at
// once, so its name is typed in place.
async function createFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "Add to project" }).click()
  await page.getByRole("menuitem", { name: "New folder", exact: true }).click()
  const field = page.getByLabel("Name")
  await expect(field).toBeFocused()
  await field.fill(name)
  await field.press("Enter")
  await expect(folderRow(page, name)).toBeVisible()
}

// A folder's row is a button that opens and closes it; a document's row is
// a link to it. The open document's name is also the last crumb of the
// trail, which is a link too, but a disabled one: it is where you are.
const folderRow = (page: Page, name: string) => page.getByRole("button", { name, exact: true })
const documentRow = (page: Page, name: string) =>
  page.getByRole("link", { name, exact: true, disabled: false })

async function expandFolder(page: Page, name: string) {
  const expand = page.getByRole("button", { name: `Expand ${name}` })
  if (await expand.isVisible()) await expand.click()
  await expect(page.getByRole("button", { name: `Collapse ${name}` })).toBeVisible()
}

async function collapseFolder(page: Page, name: string) {
  await page.getByRole("button", { name: `Collapse ${name}` }).click()
  await expect(page.getByRole("button", { name: `Expand ${name}` })).toBeVisible()
}

// The menu each row has, for what can be done to it.
async function rowMenu(page: Page, name: string, item: string) {
  await page.getByRole("button", { name: `Actions for ${name}` }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
}

// The field takes the focus a moment after the menu closes, because the
// closing menu hands the focus back to its own button. Typing before then
// would be undone by that hand-back, so the focus is what is waited for.
async function renameRow(page: Page, from: string, to: string) {
  await rowMenu(page, from, "Rename")
  const field = page.getByLabel("Name")
  await expect(field).toBeFocused()
  await field.fill(to)
  await field.press("Enter")
}

test("a document is made in a folder, renamed, moved, trashed, restored and deleted for good", async ({ page }) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj")

  const folderA = `Folder A ${id}`
  await createFolder(page, folderA)

  // A document inside the folder. Creating one opens it, and its title is
  // the database's default until it is renamed.
  await rowMenu(page, folderA, "New text document inside")
  await page.waitForURL(/\/d\//)
  await expect(documentRow(page, "Untitled")).toBeVisible()

  const doc = `Notes ${id}`
  await renameRow(page, "Untitled", doc)
  await expect(documentRow(page, doc)).toBeVisible()
  // The page is the document, so its title follows.
  await expect(page.getByLabel("Document title")).toHaveValue(doc)

  // A second folder, and the document dragged into it. Away from the
  // document's own page first: the tree keeps the open document's folder
  // open whatever is pressed, which would hide where the document went.
  const folderB = `Folder B ${id}`
  await createFolder(page, folderB)
  await page.goto(`/${slug}/${projectId}`)
  await expect(page.getByText("Pick a sheet")).toBeVisible()
  await expandFolder(page, folderA)
  await documentRow(page, doc).dragTo(folderRow(page, folderB))

  // Now under B: it goes away when B closes, and not when A does.
  await expandFolder(page, folderB)
  await expect(documentRow(page, doc)).toBeVisible()
  await collapseFolder(page, folderA)
  await expect(documentRow(page, doc)).toBeVisible()
  await collapseFolder(page, folderB)
  await expect(documentRow(page, doc)).toBeHidden()
  await expandFolder(page, folderB)

  // To the trash, and back.
  await rowMenu(page, doc, "Move to trash")
  await expect(page.getByText("Moved to trash.")).toBeVisible()
  await expect(documentRow(page, doc)).toBeHidden()

  await page.getByRole("button", { name: "Project menu" }).click()
  await page.getByRole("menuitem", { name: "Trash" }).click()
  await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible()
  const row = page.getByRole("listitem").filter({ hasText: doc })
  await row.getByRole("button", { name: "Restore" }).click()
  await expect(page.getByText("Restored.")).toBeVisible()
  await expect(page.getByText("The trash is empty.")).toBeVisible()

  // Restored to where it was: in folder B.
  await page.goto(`/${slug}/${projectId}`)
  await expandFolder(page, folderB)
  await expect(documentRow(page, doc)).toBeVisible()

  // And gone for good, which asks first.
  await rowMenu(page, doc, "Move to trash")
  await expect(page.getByText("Moved to trash.")).toBeVisible()
  await page.getByRole("button", { name: "Project menu" }).click()
  await page.getByRole("menuitem", { name: "Trash" }).click()
  await page.getByRole("listitem").filter({ hasText: doc }).getByRole("button", { name: "Delete forever" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText(`Delete “${doc}” forever?`)
  await dialog.getByRole("button", { name: "Delete forever" }).click()
  await expect(page.getByText("Deleted.")).toBeVisible()
  await expect(page.getByText("The trash is empty.")).toBeVisible()
  await expect(documentRow(page, doc)).toHaveCount(0)
})

// Links a document that exists elsewhere in the project to the selected
// node (R1.6), and waits for the index of references to take it: the
// whiteboard writes the index a moment after the link, and only while its
// page is open.
async function linkExisting(page: Page, title: string) {
  const indexed = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/document_links") && response.request().method() === "POST"
  )
  await inspector(page).getByRole("button", { name: "Link existing" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Search documents").fill(title)
  await dialog.getByRole("button", { name: title, exact: true }).click()
  await expect(inspector(page).getByRole("heading", { name: title })).toBeVisible()
  // The link is content of the whiteboard, saved like anything on it.
  await expectBoardSaved(page)
  await indexed
}

test("a document linked from two whiteboards says so, and warns before it is trashed", async ({ page }) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj")

  // The document that will be linked to.
  await page.getByRole("button", { name: "Add to project" }).click()
  await page.getByRole("menuitem", { name: "New text document", exact: true }).click()
  await page.waitForURL(/\/d\//)
  const target = `Target ${id}`
  await renameRow(page, "Untitled", target)
  await expect(documentRow(page, target)).toBeVisible()
  await expect(page.getByLabel("Document title")).toHaveValue(target)
  // Nothing links to it yet, so the header has nothing to say.
  await expect(page.getByRole("button", { name: /Linked from/ })).toHaveCount(0)

  const boards = [`Board One ${id}`, `Board Two ${id}`]
  for (const board of boards) {
    // From the project page, not from the last board: a new whiteboard is
    // known by its tools showing, and the last board's are still showing
    // while the new one loads.
    await page.goto(`/${slug}/${projectId}`)
    await expect(page.getByText("Pick a sheet")).toBeVisible()
    await createWhiteboard(page, board)
    await addNode(page, `Ref ${id}`)
    await linkExisting(page, target)
  }

  await documentRow(page, target).click()
  await expect(page.getByLabel("Document title")).toHaveValue(target)
  // The header counts them, and the popover it opens names them. The tree
  // names the boards too, so the links are looked for in the popover only.
  await page.getByRole("button", { name: "Linked from 2" }).click()
  const popover = page.getByRole("dialog")
  for (const board of boards)
    await expect(popover.getByRole("link", { name: board, exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(popover).toBeHidden()

  // Trashing it warns, and names the places (R1.8).
  await rowMenu(page, target, "Move to trash")
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText(`Move “${target}” to the trash?`)
  for (const board of boards) await expect(dialog).toContainText(board)
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()
  await expect(documentRow(page, target)).toBeVisible()
})
