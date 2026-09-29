import { readFileSync } from "node:fs"
import { join } from "node:path"

import { expect, test, type Download, type Page } from "@playwright/test"
import { unzipSync } from "fflate"

import {
  addNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  nodeDocument,
  signUpWithOrg,
} from "./support/app"
import { createTextDocument, expectSavedByNow, pageEditor } from "./support/collab"
import { bringIn, chooseFiles, FIXTURES, runImport, treeFolder, treeLink } from "./support/import"

// Taking work out: one document from its menu, as Markdown or as a picture,
// and a whole project as a zip that Import files takes back.

const COBALT = readFileSync(join(FIXTURES, "cobalt.png"))

// The document's own menu in the tree, and one of its items, which starts
// a download.
async function download(page: Page, documentTitle: string, item: string): Promise<Download> {
  await page.getByRole("button", { name: `Actions for ${documentTitle}` }).click()
  const started = page.waitForEvent("download")
  await page.getByRole("menuitem", { name: item }).click()
  return started
}

const contentsOf = async (file: Download) => readFileSync((await file.path())!)

// A picture pasted into the editor that has the focus, as the browser
// delivers one (the same as text-media.spec.ts).
async function pastePicture(page: Page) {
  await page.evaluate((base64) => {
    const data = new DataTransfer()
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    data.items.add(new File([bytes], "cobalt.png", { type: "image/png" }))
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, COBALT.toString("base64"))
}

async function expectPictureLoaded(page: Page) {
  const image = pageEditor(page).locator('[data-content-type="image"] img')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth)).toBeGreaterThan(0)
}

test("a page downloads as Markdown from its menu, for its editors and for a visitor to a public project", async ({
  page,
  browser,
}) => {
  await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj", "public")
  await bringIn(page, "Paste Markdown…")
  await page
    .getByRole("textbox", { name: "Markdown" })
    .fill('# Launch notes\n\n## Steps\n\n- Write it\n- Ship it\n\n$$\nE = mc^2\n$$\n\n<aside data-icon="💡">\n\nRemember the $x^2$ term.\n\n</aside>\n\n[TOC]\n')
  await page.getByRole("button", { name: "Create document" }).click()
  await expect(page.getByLabel("Document title")).toHaveValue("Launch notes")

  const file = await download(page, "Launch notes", "Download as Markdown")
  expect(file.suggestedFilename()).toBe("Launch notes.md")
  const markdown = (await contentsOf(file)).toString("utf8")
  // The title first, then the blocks as the MCP tools read and write them.
  expect(markdown).toMatch(/^# Launch notes\n\n## Steps\n/)
  expect(markdown).toContain("* Write it\n* Ship it")
  expect(markdown).toContain("$$\nE = mc^2\n$$")
  expect(markdown).toContain('<aside data-icon="💡">\n\nRemember the $x^2$ term.\n\n</aside>')
  expect(markdown).toContain("[TOC]")

  // Someone with no account reads a public project, so they can download it too.
  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()
  try {
    await visitor.goto(`${new URL(page.url()).origin}/p/${projectId}`)
    const theirs = await download(visitor, "Launch notes", "Download as Markdown")
    expect((await contentsOf(theirs)).toString("utf8")).toBe(markdown)
  } finally {
    await visitorContext.close()
  }
})

test("a whiteboard in a private project downloads as SVG, and nobody outside it can have it", async ({ page, browser }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const alpha = `Alpha${id.slice(0, 6)}`
  const beta = `Beta${id.slice(0, 6)}`
  await addNode(page, alpha)
  await addNode(page, beta)
  await expectSaved(page)

  const file = await download(page, "Board", "Download as SVG")
  expect(file.suggestedFilename()).toBe("Board.svg")
  const svg = (await contentsOf(file)).toString("utf8")
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  expect(svg).toContain(alpha)
  expect(svg).toContain(beta)

  // The same address, asked without the owner's session: the project is
  // private, so there is nothing there.
  const docId = new URL(page.url()).pathname.split("/d/")[1]
  const stranger = await browser.newContext()
  try {
    const response = await stranger.request.get(`${new URL(page.url()).origin}/api/documents/${docId}/svg`)
    expect(response.status()).toBe(404)
    expect(await response.text()).not.toContain(alpha)
  } finally {
    await stranger.close()
  }
})

test("a project exports as a zip of pages, whiteboards and pictures, and Import files brings its pages back", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const id = freshId()
  const { slug } = await signUpWithOrg(page)
  await createProject(page, "Launch")

  // A page with a picture in it.
  await createTextDocument(page, "Setup")
  const editor = pageEditor(page)
  await editor.click()
  await page.keyboard.type(`Before the picture ${id}`)
  await page.keyboard.press("Enter")
  await pastePicture(page)
  await expectPictureLoaded(page)
  await expectSavedByNow(page)

  // A whiteboard whose box holds a description.
  await createWhiteboard(page, "Board")
  await addNode(page, "API")
  await expectSaved(page)
  await inspector(page).getByRole("button", { name: "Write a description…" }).click()
  const description = nodeDocument(page).getByRole("textbox")
  await description.click()
  await page.keyboard.type(`The public API ${id}`)
  await expectSaved(nodeDocument(page))

  await page.getByRole("button", { name: "Project menu" }).click()
  await page.getByRole("menuitem", { name: "Export project…" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Export “Launch”")).toBeVisible()
  const started = page.waitForEvent("download")
  await dialog.getByRole("button", { name: "Export", exact: true }).click()
  const zipFile = await started
  expect(zipFile.suggestedFilename()).toBe("Launch.zip")
  await expect(dialog.getByRole("heading", { name: "Exported" })).toBeVisible()
  await expect(dialog.getByText(/holds 3 documents and 1 picture or video/)).toBeVisible()

  const bytes = await contentsOf(zipFile)
  const files = unzipSync(new Uint8Array(bytes))
  const text = (name: string) => new TextDecoder().decode(files[name])
  expect(Object.keys(files).sort()).toEqual(
    ["Board.json", "Board.svg", "Board/API.md", "README.txt", "Setup.md", "Setup/cobalt.png", "subcanvas-export.json"].sort()
  )

  // The page, pointing at its picture beside it; the picture as it was.
  expect(text("Setup.md")).toMatch(new RegExp(`^# Setup\n\nBefore the picture ${id}\n`))
  expect(text("Setup.md")).toContain("![cobalt.png](Setup/cobalt.png)")
  expect(Buffer.from(files["Setup/cobalt.png"]).equals(COBALT)).toBe(true)
  // The whiteboard: its picture, and its contents with what the box holds.
  expect(text("Board.svg")).toContain("API")
  const board = JSON.parse(text("Board.json"))
  expect(board.nodes).toEqual([
    expect.objectContaining({ kind: "plain", title: "API", holds: expect.objectContaining({ type: "text", path: "Board/API.md" }) }),
  ])
  expect(text("Board/API.md")).toBe(`# API\n\nThe public API ${id}\n`)
  expect(text("README.txt")).toMatch(/^Launch\n\nExported from localhost:\d+ on /)
  expect(JSON.parse(text("subcanvas-export.json"))).toMatchObject({ format: "subcanvas-export", project: { name: "Launch" } })
  await dialog.getByRole("button", { name: "Done" }).click()

  // Into a new project: the pages come back, the picture with them, and the
  // box's page in a folder named after its whiteboard.
  await page.goto(`/${slug}`)
  await createProject(page, "Copy")
  await bringIn(page, "Import files…")
  await chooseFiles(page, "files", { name: "Launch.zip", mimeType: "application/zip", buffer: bytes })
  await expect(page.getByRole("dialog").getByText("2 documents in 1 folder will be added to Copy")).toBeVisible()
  await runImport(page, 2)
  await page.keyboard.press("Escape")

  await treeLink(page, "Setup").click()
  await expect(page.getByLabel("Document title")).toHaveValue("Setup")
  await expect(pageEditor(page)).toContainText(`Before the picture ${id}`)
  await expectPictureLoaded(page)
  await expect(treeFolder(page, "Board")).toBeVisible()
})
