import { readFileSync } from "node:fs"
import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { breadcrumb, createProject, expectSaved, freshId, signUpWithOrg } from "./support/app"
import { createTextDocument, pageEditor } from "./support/collab"
import { FIXTURES, treeLink } from "./support/import"

// Pictures in text documents: kept where a whiteboard's are, filed under the
// document, and shown to whoever can read it.

const COBALT = readFileSync(join(FIXTURES, "cobalt.png")).toString("base64")

// A paste the way the browser delivers one: a ClipboardEvent whose data
// holds a file, or some HTML, sent to the editor that has the focus.
async function paste(page: Page, what: { file?: { name: string; type: string; base64: string }; html?: string }) {
  await page.evaluate(({ file, html }) => {
    const data = new DataTransfer()
    if (file) {
      const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0))
      data.items.add(new File([bytes], file.name, { type: file.type }))
    }
    if (html) data.setData("text/html", html)
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, what)
}

const images = (editor: Locator) => editor.locator('[data-content-type="image"] img')

// Drawn, not just there: the browser loaded the file.
async function expectLoaded(image: Locator) {
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth)).toBeGreaterThan(0)
}

test("a picture pasted into a text document is uploaded, is there after a reload, and a visitor to a public project sees it", async ({
  page,
  browser,
}) => {
  const id = freshId()
  await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj", "public")
  await createTextDocument(page, `Notes ${id}`)

  const editor = pageEditor(page)
  await editor.click()
  await page.keyboard.type(`Before the picture ${id}`)
  await page.keyboard.press("Enter")
  await paste(page, { file: { name: "cobalt.png", type: "image/png", base64: COBALT } })
  await expectLoaded(images(editor))
  await expectSaved(page)

  await page.reload()
  const after = pageEditor(page)
  await expectLoaded(images(after))
  // Shown through a signed address that Storage serves, not through the app.
  await expect(images(after)).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/media-images\//)

  const origin = new URL(page.url()).origin
  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()
  try {
    await visitor.goto(`${origin}/p/${projectId}`)
    await visitor.getByRole("link", { name: `Notes ${id}` }).click()
    await expect(visitor.getByText(`Before the picture ${id}`)).toBeVisible()
    await expectLoaded(images(visitor.getByRole("main")))
  } finally {
    await visitorContext.close()
  }
})

test("a file that is not a picture or video is refused, says why, and leaves nothing behind", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createTextDocument(page, `Notes ${freshId()}`)

  const editor = pageEditor(page)
  await editor.click()
  await paste(page, { file: { name: "minutes.pdf", type: "application/pdf", base64: btoa("%PDF-1.4") } })
  await expect(page.getByText(/minutes\.pdf is not a picture or video that can be added/)).toBeVisible()
  await expect(editor.locator('[data-content-type="file"], [data-content-type="image"]')).toHaveCount(0)
})

test("a picture pasted from another document gets a copy of its own", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")

  await createTextDocument(page, `First ${id}`)
  await pageEditor(page).click()
  await paste(page, { file: { name: "cobalt.png", type: "image/png", base64: COBALT } })
  await expectLoaded(images(pageEditor(page)))
  await expectSaved(page)
  // The address the block keeps: the file, filed under this document.
  const original = await page.evaluate(async () => {
    const image = document.querySelector('[data-content-type="image"]')
    return image?.getAttribute("data-url") ?? ""
  })
  expect(original).toMatch(/^\/api\/media\//)

  // The second document from the project's page: made while the first is
  // open, its editor would be found before the new one had replaced it.
  await breadcrumb(page).getByRole("link", { name: "Proj" }).click()
  await expect(page.getByText("Open a whiteboard or a page")).toBeVisible()
  await createTextDocument(page, `Second ${id}`)
  await expect(treeLink(page, `Second ${id}`)).toBeVisible()
  const second = pageEditor(page)
  await second.click()
  await paste(page, { html: `<img src="${original}" alt="cobalt">` })

  // Filed under this document now, so this document's readers can see it.
  const address = () => page.evaluate(() => document.querySelector('[data-content-type="image"]')?.getAttribute("data-url") ?? "")
  await expect.poll(address).not.toBe(original)
  const copied = await address()
  expect(copied).toMatch(/^\/api\/media\//)
  // /api/media/<org>/<project>/<document>/<file>: another document, another file.
  expect(copied.split("/")[5]).not.toBe(original.split("/")[5])
  expect(copied.split("/")[6]).not.toBe(original.split("/")[6])
  await expectLoaded(images(second))
})
