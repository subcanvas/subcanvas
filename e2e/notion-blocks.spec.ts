import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { createProject, expectSaved, freshId, signUpWithOrg } from "./support/app"
import { createTextDocument, pageEditor } from "./support/collab"
import { zipSync } from "fflate"

import { bringIn, chooseFiles, runImport } from "./support/import"

// The blocks a text document has beyond BlockNote's own, for what Notion
// pages hold: callouts, equations, bookmarks, a table of contents, and
// columns. Each is added from the slash menu, as a person would.

const block = (editor: Locator, type: string) => editor.locator(`[data-content-type="${type}"]`)

// A new line at the end of the document: the empty line already there, or
// the space below the last block, which BlockNote shows when there is none
// and turns into one when clicked.
async function newLine(editor: Locator) {
  const below = editor.locator(".bn-trailing-block")
  if (await below.count()) await below.last().click()
  else await block(editor, "paragraph").last().click()
}

async function slash(page: Page, editor: Locator, command: string) {
  await newLine(editor)
  await page.keyboard.type(`/${command}`)
  await expect(page.getByRole("option").first()).toBeVisible()
  await page.keyboard.press("Enter")
}

test("callouts, equations, bookmarks, a table of contents and columns are added from the slash menu and come back after a reload", async ({
  page,
}) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createTextDocument(page, `Blocks ${id}`)
  const editor = pageEditor(page)
  await editor.click()

  await page.keyboard.type(`## Alpha ${id}`)
  await page.keyboard.press("Enter")

  // A callout, with a different emoji.
  await slash(page, editor, "callout")
  await page.keyboard.type(`Remember ${id}`)
  const callout = block(editor, "callout")
  await expect(callout).toContainText(`Remember ${id}`)
  await callout.getByRole("button", { name: /Callout icon/ }).click()
  await page.getByRole("button", { name: /^warning/ }).click()
  await expect(callout.getByRole("button", { name: /Callout icon: ⚠️/ })).toBeVisible()

  // Display maths: it opens straight into its TeX.
  await slash(page, editor, "equation")
  await page.getByLabel("TeX", { exact: true }).fill("\\frac{1}{2}")
  await page.getByLabel("TeX", { exact: true }).press("Enter")
  await expect(block(editor, "equation").locator(".katex")).toBeVisible()

  // A bookmark from a bare address.
  await slash(page, editor, "bookmark")
  await page.getByLabel("Bookmark address").fill("example.com/guide")
  await page.getByLabel("Bookmark address").press("Enter")
  await expect(block(editor, "bookmark").getByRole("link")).toHaveAttribute("href", "https://example.com/guide")

  // A table of contents lists the heading, and a new one as it is written.
  await slash(page, editor, "table of contents")
  const contents = editor.getByRole("navigation", { name: "Table of contents" })
  await expect(contents.getByRole("link", { name: `Alpha ${id}` })).toBeVisible()

  // Two columns.
  await slash(page, editor, "two columns")
  await expect(editor.locator('[data-node-type="columnList"] [data-node-type="column"]')).toHaveCount(2)

  // Inline maths in a paragraph.
  await newLine(editor)
  await page.keyboard.type("Area ")
  await page.keyboard.type("/inline equation")
  await expect(page.getByRole("option").first()).toBeVisible()
  await page.keyboard.press("Enter")
  await page.getByLabel("TeX", { exact: true }).fill("\\pi r^2")
  await page.getByLabel("TeX", { exact: true }).press("Enter")
  await expect(editor.locator(".sc-inline-equation .katex")).toBeVisible()

  await expectSaved(page)
  await page.screenshot({ path: test.info().outputPath("blocks.png"), fullPage: true })
  await page.reload()

  const after = pageEditor(page)
  await expect(block(after, "callout")).toContainText(`Remember ${id}`)
  await expect(block(after, "callout").getByRole("button", { name: /Callout icon: ⚠️/ })).toBeVisible()
  await expect(block(after, "equation").locator("annotation")).toHaveText("\\frac{1}{2}")
  await expect(block(after, "bookmark").getByRole("link")).toHaveAttribute("href", "https://example.com/guide")
  await expect(after.getByRole("navigation", { name: "Table of contents" }).getByRole("link", { name: `Alpha ${id}` })).toBeVisible()
  await expect(after.locator('[data-node-type="columnList"] [data-node-type="column"]')).toHaveCount(2)
  await expect(after.locator(".sc-inline-equation annotation")).toHaveText("\\pi r^2")
})

// The unit tests' Notion HTML export (src/lib/import/__fixtures__), zipped
// the way Notion hands it over.
// Bytes, not text: the export holds a picture.
function notionExport() {
  const root = join(__dirname, "..", "src", "lib", "import", "__fixtures__", "notion-html")
  const files: Record<string, Uint8Array> = {}
  const walk = (folder: string, prefix: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(join(folder, entry.name), path)
      else files[path] = new Uint8Array(readFileSync(join(folder, entry.name)))
    }
  }
  walk(root, "")
  return Buffer.from(zipSync(files))
}

test("a Notion HTML export comes in with its callouts, columns, equations, bookmarks and page links", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Wiki")

  await bringIn(page, "Import files…")
  await chooseFiles(page, "files", { name: "Export.zip", mimeType: "application/zip", buffer: notionExport() })
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("4 documents will be added to Wiki")).toBeVisible()
  await expect(dialog.getByText("1 picture or video in these pages will be uploaded with them.")).toBeVisible()
  await runImport(page, 4)
  await dialog.getByRole("button", { name: "Open “Team Wiki”" }).click()
  await expect(page.getByLabel("Document title")).toHaveValue("Team Wiki")

  const editor = pageEditor(page)
  await expect(block(editor, "callout")).toContainText("Read this first.")
  await expect(block(editor, "callout").getByRole("button", { name: /Callout icon: 💡/ })).toBeVisible()
  await expect(editor.locator('[data-node-type="column"]')).toHaveText(["Left column", "Right column"])
  await expect(block(editor, "equation").locator("annotation")).toHaveText("E = mc^2")
  await expect(editor.locator(".sc-inline-equation annotation")).toHaveText("e^{i\\pi} + 1 = 0")
  await expect(block(editor, "bookmark").first().getByRole("link")).toHaveAttribute("href", "https://nextjs.org/docs")
  await expect(block(editor, "bookmark").first()).toContainText("Welcome to the Next.js Documentation.")
  await expect(editor.getByRole("navigation", { name: "Table of contents" }).getByRole("link")).toHaveText([
    "Start here",
    "Toggle heading",
  ])
  await expect(block(editor, "checkListItem")).toHaveText(["Get a laptop", "Read the handbook"])
  // The export's own picture came with the page, and is drawn from Storage.
  const picture = block(editor, "image").locator("img")
  await expect(picture).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/media-images\//)
  await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBeGreaterThan(0)
  await expect(block(editor, "image")).toContainText("Office map")
  await page.screenshot({ path: test.info().outputPath("imported.png"), fullPage: true })

  // A link to a page is that page's card, and it opens the page.
  await block(editor, "documentLink").getByRole("link", { name: /Onboarding/ }).click()
  await expect(page.getByLabel("Document title")).toHaveValue("Onboarding")
})
