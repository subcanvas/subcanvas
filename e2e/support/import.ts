import { join } from "node:path"

import { expect, type Page } from "@playwright/test"
import { strToU8, zipSync } from "fflate"

// What the import, media and embed specs share: where the fixtures are, the
// second server the GitHub import runs against, and the few steps every
// import takes through the dialog.

export const FIXTURES = join(__dirname, "..", "fixtures")

// --- The GitHub import's server -------------------------------------------

// "Import from GitHub" is tested against a repository that is a folder on
// disk (src/lib/github/fixture-provider.ts), so no test reaches
// api.github.com. The provider is reachable only in a development server:
// `next build` writes NODE_ENV into the bundle as a constant, so the
// production build every other spec runs against cannot be pointed at the
// fixtures whatever it is started with. playwright.config.ts starts a
// `next dev` on this port with SUBCANVAS_IMPORT_FIXTURES set, and the
// GitHub spec alone uses it.
export const GITHUB_FIXTURES = join(FIXTURES, "github")
export const DEV_PORT = Number(process.env.E2E_DEV_PORT ?? Number(process.env.E2E_PORT ?? 3310) + 100)
// localhost, not 127.0.0.1, for the reason given in playwright.config.ts.
export const devBaseURL = process.env.E2E_DEV_BASE_URL ?? `http://localhost:${DEV_PORT}`

// --- Zips built from small fixtures ---------------------------------------

// A zip made in the test from a few strings, the way an app's export would
// be, so the repository holds text and not archives.
export function zipOf(files: Record<string, string>) {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)]))))
}

// The shape of a Notion "Markdown & CSV" export: an id after every name,
// a page's subpages in a folder named after the page, links URL-encoded.
const WIKI = "Team Wiki 1f0c2a9b7d3e4f5a8b6c9d0e1f2a3b4c"
const ONBOARDING = "Onboarding 2a1d3b9c8e7f4a6b9c0d1e2f3a4b5c6d"
export const NOTION_EXPORT: Record<string, string> = {
  [`${WIKI}.md`]: `# Team Wiki\n\nWhere the team writes things down.\n\n[Onboarding](${encodeURIComponent(WIKI)}/${encodeURIComponent(ONBOARDING)}.md)\n`,
  [`${WIKI}/${ONBOARDING}.md`]: `# Onboarding\n\nYour first week, in order.\n\n- [x] Get a laptop\n- [ ] Meet your buddy\n\nBack to the [Team Wiki](../${encodeURIComponent(WIKI)}.md).\n`,
}

// An Obsidian vault: wiki links by name, a settings folder to ignore.
export const OBSIDIAN_VAULT: Record<string, string> = {
  "Home.md": "---\ntitle: Vault home\n---\nStart at [[Projects/Apollo|the Apollo project]] or read [[Glossary]].\n",
  "Glossary.md": "**Apogee**: the far point of an orbit. See [[Apollo]].\n",
  "Projects/Apollo.md": "# Apollo\n\n## Orbit\n\nDefined in the [[Glossary]].\n",
  ".obsidian/app.json": "{}",
}

// --- The whiteboard -----------------------------------------------------------

// React Flow's root, the one handle on the canvas that is not a style class
// (the same one support/app.ts keeps to itself).
export const canvas = (page: Page) => page.getByRole("application")

// Selects a picture on the canvas with a real pointer, for the same reason
// clickNode in support/app.ts uses one: React Flow hands the press to
// d3-drag, which needs a real event. A picture has no label to press, so
// it is found by its alt text.
export async function clickPicture(page: Page, alt: string) {
  const picture = canvas(page).getByRole("img", { name: alt })
  await expect(picture).toBeVisible()
  const box = await picture.boundingBox()
  if (!box) throw new Error(`The picture “${alt}” has no box to press`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
  await page.mouse.down()
  await page.mouse.up()
}

// --- The import dialog ------------------------------------------------------

// Opens the project's + menu and picks a way to bring notes in.
export async function bringIn(page: Page, item: "Import files…" | "Paste Markdown…") {
  await page.getByRole("button", { name: "Add to project" }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
}

type Picked = Parameters<import("@playwright/test").FileChooser["setFiles"]>[0]

// Hands files to the dialog the way a person does: through its button and
// the browser's file chooser. The inputs behind the buttons are hidden, so
// this is the one way to them that goes through what is on screen.
export async function chooseFiles(page: Page, how: "files" | "folder", files: Picked) {
  const chooser = page.waitForEvent("filechooser")
  await page
    .getByRole("dialog")
    .getByRole("button", { name: how === "folder" ? "Choose a folder" : "Choose files or a zip" })
    .click()
  await (await chooser).setFiles(files)
}

// From the preview through to "Imported". `documents` is how many the
// preview must offer, which is the plan's count and so a check of its own.
export async function runImport(page: Page, documents: number) {
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Ready to import")).toBeVisible()
  await dialog
    .getByRole("button", { name: `Import ${documents} ${documents === 1 ? "document" : "documents"}`, exact: true })
    .click()
  await expect(dialog.getByText("Imported", { exact: true })).toBeVisible()
}

// The project tree sits in the sidebar, which has no landmark of its own,
// so it is found by the slot the sidebar component marks itself with. A
// title in the trail or in a document's text would otherwise match too.
const tree = (page: Page) => page.locator("[data-slot=sidebar]").first()

// A document's link in the project tree. Folders are buttons there, and
// documents are links, so a name found as a link is a document.
export const treeLink = (page: Page, title: string) =>
  tree(page).getByRole("link", { name: title, exact: true })

export const treeFolder = (page: Page, name: string) =>
  tree(page).getByRole("button", { name, exact: true })

// The text of a document open on a page of its own. The title above it is a
// textbox too, so the editor is told apart as the one that holds blocks.
export const pageEditor = (page: Page) => page.getByRole("main").getByRole("textbox").filter({ has: page.locator("[data-content-type]") })

// BlockNote draws a list as blocks with no list semantics, so a list item
// is found by the kind the editor gives it, not by a role.
export const listItems = (page: Page, kind: "bulletListItem" | "numberedListItem" | "checkListItem") =>
  page.getByRole("main").locator(`[data-content-type="${kind}"]`)
