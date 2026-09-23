import { join } from "node:path"

import { expect, test } from "@playwright/test"

import { createProject, signUpWithOrg } from "./support/app"
import {
  bringIn,
  chooseFiles,
  FIXTURES,
  listItems,
  NOTION_EXPORT,
  OBSIDIAN_VAULT,
  pageEditor,
  runImport,
  treeFolder,
  treeLink,
  zipOf,
} from "./support/import"

// Notes come in from other apps as Markdown: a folder of files, or the zip
// an app exports. Everything is read in the browser and sent as text, so
// the zips here are built in the test from a few strings (support/import.ts).

// A folder in the tree opens and closes on its own button. Whether it is
// open after an import depends on nothing a test should rely on, so a
// document inside one is reached by opening the folder when it is shut.
async function openFolder(page: import("@playwright/test").Page, name: string) {
  await expect(treeFolder(page, name)).toBeVisible()
  const shut = page.getByRole("button", { name: `Expand ${name}`, exact: true })
  if (await shut.isVisible()) await shut.click()
}

test("a folder of Markdown becomes documents in folders, with headings, lists and links between them", async ({
  page,
}) => {
  await signUpWithOrg(page)
  const projectId = await createProject(page, "Notes")

  await bringIn(page, "Import files…")
  // The fixture is `notes/Welcome.md` and `notes/guides/Plan.md`, and the
  // picked folder itself stays a folder, as it does for a person.
  await chooseFiles(page, "folder", join(FIXTURES, "markdown", "notes"))
  await expect(page.getByRole("dialog").getByText("2 documents in 2 folders will be added to Notes")).toBeVisible()
  await runImport(page, 2)
  await page.getByRole("dialog").getByRole("button", { name: /^Open “/ }).click()

  // Folders stay folders, and the documents are in them.
  await openFolder(page, "notes")
  await openFolder(page, "guides")
  await treeLink(page, "Plan").click()
  await expect(page.getByLabel("Document title")).toHaveValue("Plan")

  // The opening `# Plan` became the title, so the text starts at `## Steps`.
  const editor = pageEditor(page)
  await expect(editor.getByRole("heading", { name: "Steps" })).toBeVisible()
  await expect(listItems(page, "numberedListItem")).toHaveText(["One", "Two"])

  // `[Welcome](../Welcome.md)` now points at the document that file became.
  const back = editor.getByRole("link", { name: "Welcome" })
  await expect(back).toHaveAttribute("href", new RegExp(`/${projectId}/d/[0-9a-f-]{36}$`))
  await page.goto((await back.getAttribute("href"))!)
  await expect(page.getByLabel("Document title")).toHaveValue("Welcome")
  await expect(listItems(page, "bulletListItem")).toHaveText(["First", "Second"])
  await expect(pageEditor(page).getByRole("link", { name: "plan" })).toHaveAttribute(
    "href",
    new RegExp(`/${projectId}/d/[0-9a-f-]{36}$`)
  )
})

test("a Notion export nests subpages under their page, and its links resolve", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Wiki")

  await bringIn(page, "Import files…")
  await chooseFiles(page, "files", { name: "Export.zip", mimeType: "application/zip", buffer: zipOf(NOTION_EXPORT) })
  // Notion's ids are gone from the names, and the subpage nests under the
  // page rather than sitting in a folder beside it.
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("2 documents will be added to Wiki")).toBeVisible()
  await expect(dialog.getByRole("list", { name: "What will be imported" }).getByRole("listitem")).toHaveText(["Team Wiki", "Onboarding"])
  await runImport(page, 2)
  await dialog.getByRole("button", { name: "Open “Team Wiki”" }).click()
  await expect(page.getByLabel("Document title")).toHaveValue("Team Wiki")

  // The URL-encoded link Notion writes leads to the subpage.
  const link = pageEditor(page).getByRole("link", { name: "Onboarding" })
  await page.goto((await link.getAttribute("href"))!)
  await expect(page.getByLabel("Document title")).toHaveValue("Onboarding")
  await expect(listItems(page, "checkListItem")).toHaveText(["Get a laptop", "Meet your buddy"])
  await expect(pageEditor(page).getByRole("link", { name: "Team Wiki" })).toBeVisible()
  // And the subpage is under its page in the tree.
  await expect(treeLink(page, "Team Wiki")).toBeVisible()
  await expect(treeLink(page, "Onboarding")).toBeVisible()
})

test("an Obsidian vault keeps its folders, titles from front matter, and wiki links", async ({ page }) => {
  await signUpWithOrg(page)
  const projectId = await createProject(page, "Vault")

  await bringIn(page, "Import files…")
  await chooseFiles(page, "files", { name: "vault.zip", mimeType: "application/zip", buffer: zipOf(OBSIDIAN_VAULT) })
  // `.obsidian` is ignored: three notes, one folder.
  await expect(page.getByRole("dialog").getByText("3 documents in 1 folder will be added to Vault")).toBeVisible()
  await runImport(page, 3)
  await page.getByRole("dialog").getByRole("button", { name: /^Open “/ }).click()

  // `Home.md` has no heading, so its title is the front matter's.
  await treeLink(page, "Vault home").click()
  await expect(page.getByLabel("Document title")).toHaveValue("Vault home")
  const editor = pageEditor(page)
  // `[[Projects/Apollo|the Apollo project]]` and `[[Glossary]]`, by name.
  const apollo = editor.getByRole("link", { name: "the Apollo project" })
  await expect(apollo).toHaveAttribute("href", new RegExp(`/${projectId}/d/[0-9a-f-]{36}$`))
  await expect(editor.getByRole("link", { name: "Glossary" })).toHaveAttribute(
    "href",
    new RegExp(`/${projectId}/d/[0-9a-f-]{36}$`)
  )
  await page.goto((await apollo.getAttribute("href"))!)
  await expect(page.getByLabel("Document title")).toHaveValue("Apollo")
  await expect(pageEditor(page).getByRole("heading", { name: "Orbit" })).toBeVisible()
  await openFolder(page, "Projects")
  await expect(treeLink(page, "Apollo")).toBeVisible()
})

test("pasted Markdown becomes one document, titled by its heading", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Scratch")

  await bringIn(page, "Paste Markdown…")
  await page.getByRole("textbox", { name: "Markdown" }).fill("# Pasted notes\n\n## Why\n\n- Because it was quick\n- And it worked\n")
  await page.getByRole("button", { name: "Create document" }).click()

  await expect(page.getByLabel("Document title")).toHaveValue("Pasted notes")
  await expect(pageEditor(page).getByRole("heading", { name: "Why" })).toBeVisible()
  await expect(listItems(page, "bulletListItem")).toHaveText(["Because it was quick", "And it worked"])
  await expect(treeLink(page, "Pasted notes")).toBeVisible()
})

test("a file over the size limit is left out and said so, before anything is imported", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Notes")

  await bringIn(page, "Import files…")
  // One note is 500 KB of text, the limit for one document. The other is
  // fine, so the import is still offered, minus the one that is not.
  await chooseFiles(page, "files", [
    { name: "big.md", mimeType: "text/markdown", buffer: Buffer.from(`# Big\n\n${"words ".repeat(100_000)}`) },
    { name: "small.md", mimeType: "text/markdown", buffer: Buffer.from("# Small\n\nFits.\n") },
  ])
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("1 document will be added to Notes")).toBeVisible()
  await expect(dialog.getByText("1 file skipped, too large for one document: big.md")).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Import 1 document", exact: true })).toBeVisible()
})
