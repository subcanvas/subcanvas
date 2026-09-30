import { readFileSync } from "node:fs"

import { expect, test, type Locator, type Page } from "@playwright/test"
import { unzipSync } from "fflate"

import { breadcrumb, createProject, expectSaved, signUpWithOrg } from "./support/app"
import { createTextDocument, pageEditor } from "./support/collab"
import { treeFolder, treeLink } from "./support/import"

// A folder in the trash takes everything in it out of view, the same as a
// page in the trash: no "Linked from" names a page inside it, no picker
// offers one, and an export leaves the folder out. Trashing it warns first
// when a page outside it links in (R1.8).

// Adds a folder at the project's top level. A new folder opens for renaming
// at once, so its name is typed in place (the same as tree.spec.ts).
async function createFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "Add to project" }).click()
  await page.getByRole("menuitem", { name: "New folder", exact: true }).click()
  const field = page.getByLabel("Name")
  await expect(field).toBeFocused()
  await field.fill(name)
  await field.press("Enter")
  await expect(treeFolder(page, name)).toBeVisible()
}

// The menu each row of the tree has, for what can be done to it.
async function rowMenu(page: Page, name: string, item: string) {
  await page.getByRole("button", { name: `Actions for ${name}` }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
}

// A new page inside a folder, from the folder's own menu. Creating a page
// opens it, titled "Untitled" until it is named in its title field. The
// address changing is what tells the new page from the one open before.
async function createPageIn(page: Page, folder: string, title: string) {
  const before = page.url()
  await rowMenu(page, folder, "New page inside")
  await page.waitForURL((url) => url.href !== before)
  const field = page.getByLabel("Document title")
  await expect(field).toHaveValue("Untitled")
  await expect(pageEditor(page)).toBeVisible()
  await field.fill(title)
  // The title saves on blur, and the trail is rendered on the server, so
  // the name showing up there means the rename was saved.
  await field.press("Enter")
  await expect(breadcrumb(page).getByText(title, { exact: true })).toBeVisible()
}

// Opens a page from the tree, and waits for it to be the one on screen.
async function openPage(page: Page, title: string) {
  await treeLink(page, title).click()
  await expect(page.getByLabel("Document title")).toHaveValue(title)
}

// A new line at the end of the page: the empty line already there, or the
// space below the last block, which BlockNote shows when there is none and
// turns into one when clicked (the same as notion-blocks.spec.ts).
async function newLine(editor: Locator) {
  const below = editor.locator(".bn-trailing-block")
  if (await below.count()) await below.last().click()
  else await editor.locator('[data-content-type="paragraph"]').last().click()
}

// The picker that links an existing document (R1.6), opened the way a
// person opens it in a page: "/" and "Link to document".
async function openPicker(page: Page) {
  await newLine(pageEditor(page))
  await page.keyboard.type("/link to document")
  await expect(page.getByRole("option").first()).toContainText("Link to document")
  await page.keyboard.press("Enter")
  const picker = page.getByRole("dialog")
  await expect(picker).toContainText("Link an existing document")
  return picker
}

// Links an existing document from the open page, and waits for the index
// of links to take it: the page writes the index a moment after its
// content changes, and only while it is open. "Linked from" and the warning
// before trashing are read from that index.
async function linkFromPage(page: Page, title: string) {
  const indexed = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/document_links") && response.request().method() === "POST"
  )
  const picker = await openPicker(page)
  await picker.getByLabel("Search documents").fill(title)
  await picker.getByRole("button", { name: title, exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(pageEditor(page).getByRole("link", { name: title })).toBeVisible()
  await expectSaved(page)
  await indexed
}

// The header of the open page counts the pages that link to it, and its
// popover names them.
async function expectLinkedFrom(page: Page, titles: string[]) {
  await page.getByRole("button", { name: `Linked from ${titles.length}` }).click()
  const popover = page.getByRole("dialog")
  for (const title of titles) await expect(popover.getByRole("link", { name: title, exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(popover).toBeHidden()
}

test("a trashed folder takes what is in it out of view everywhere", async ({ page }) => {
  // Four links, each waited for until it is saved and indexed.
  test.setTimeout(150_000)
  const { slug } = await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj")
  const [plans, roadmap, notes, overview] = ["Plans", "Roadmap", "Notes", "Overview"]

  await createFolder(page, plans)
  await createPageIn(page, plans, roadmap)

  // A page at the top that links into the folder. Made from the project's
  // own page, not from the last page: a new page is known by its editor
  // showing, and the last page's editor is still showing while it loads.
  await page.goto(`/${slug}/${projectId}`)
  await expect(page.getByText("Open a whiteboard or a page")).toBeVisible()
  await createTextDocument(page, overview)
  await linkFromPage(page, roadmap)

  // A second page in the folder, which links out of it, and to the page
  // beside it.
  await createPageIn(page, plans, notes)
  await linkFromPage(page, overview)
  await linkFromPage(page, roadmap)

  // Before: each page names the pages that link to it.
  await openPage(page, roadmap)
  await expectLinkedFrom(page, [notes, overview])
  await openPage(page, overview)
  await expectLinkedFrom(page, [notes])

  // Trashing the folder warns, and names the page outside it that links
  // in. A link from inside goes to the trash with the folder, so it is not
  // named.
  await rowMenu(page, plans, "Move to trash")
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText(`Move “${plans}” to the trash?`)
  await expect(dialog).toContainText(overview)
  await expect(dialog).not.toContainText(notes)
  await dialog.getByRole("button", { name: "Move to trash" }).click()
  await expect(page.getByText("Moved to trash.")).toBeVisible()
  await expect(treeFolder(page, plans)).toHaveCount(0)
  await expect(treeLink(page, roadmap)).toHaveCount(0)

  // After: the page inside the trashed folder no longer counts as linking
  // to Overview. The header is rendered with the title, so once the title
  // is there, so would the count be.
  await page.reload()
  await expect(page.getByLabel("Document title")).toHaveValue(overview)
  await expect(page.getByRole("button", { name: /Linked from/ })).toHaveCount(0)
  // Overview's own link into the folder says where the page went.
  await expect(pageEditor(page).getByRole("link", { name: roadmap })).toContainText("In trash")

  // The picker offers nothing from the folder: with no search, there is
  // nothing else in view to link, and a search by name finds nothing.
  const picker = await openPicker(page)
  await expect(picker.getByText("No documents found.")).toBeVisible()
  await picker.getByLabel("Search documents").fill(roadmap)
  await expect(picker.getByText("No documents found.")).toBeVisible()
  await expect(picker.getByRole("button", { name: roadmap, exact: true })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(picker).toBeHidden()

  // The export has Overview and nothing from the folder, not even the
  // folder itself.
  await page.getByRole("button", { name: "Project menu" }).click()
  await page.getByRole("menuitem", { name: "Export project…" }).click()
  const exporting = page.getByRole("dialog")
  const started = page.waitForEvent("download")
  await exporting.getByRole("button", { name: "Export", exact: true }).click()
  const zipFile = await started
  await expect(exporting.getByRole("heading", { name: "Exported" })).toBeVisible()
  await expect(exporting.getByText(/holds 1 document\./)).toBeVisible()
  const files = unzipSync(new Uint8Array(readFileSync((await zipFile.path())!)))
  expect(Object.keys(files).sort()).toEqual(["Overview.md", "README.txt", "subcanvas-export.json"])
  const manifest = JSON.parse(new TextDecoder().decode(files["subcanvas-export.json"]))
  expect(manifest.folders).toEqual([])
  expect(manifest.documents.map((document: { title: string }) => document.title)).toEqual([overview])
  await exporting.getByRole("button", { name: "Done" }).click()
})
