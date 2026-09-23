import { join } from "node:path"

import { expect, test } from "@playwright/test"

import {
  breadcrumb,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { canvas, clickPicture, FIXTURES, treeLink } from "./support/import"

// Hands a file to the Media tool the way a person does: through the tool's
// button and the browser's file chooser. The input behind the button is
// hidden, so this is the one way to it that goes through what is on screen.
async function addMedia(
  page: import("@playwright/test").Page,
  files: Parameters<import("@playwright/test").FileChooser["setFiles"]>[0]
) {
  const chooser = page.waitForEvent("filechooser")
  await whiteboardTools(page).getByRole("button", { name: "Media", exact: true }).click()
  await (await chooser).setFiles(files)
}

const picture = (page: import("@playwright/test").Page, alt: string) => canvas(page).getByRole("img", { name: alt })

// Copying a picture also puts its caption on the system clipboard, and the
// test reads it back to know the copy was taken.
test.use({ permissions: ["clipboard-read", "clipboard-write"] })

test("a picture added with the Media tool is on the canvas, is there after a reload, and pastes onto another whiteboard", async ({
  page,
}) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)
  await createProject(page, "Proj")
  // Both whiteboards first, each from the project's page: creating one
  // while another is open would find that one's tools already on screen
  // and rename it instead of waiting for the new one.
  await createWhiteboard(page, "Board A")
  await breadcrumb(page).getByRole("link", { name: "Proj" }).click()
  await expect(page.getByText("Pick a sheet")).toBeVisible()
  await createWhiteboard(page, "Board B")
  await treeLink(page, "Board A").click()
  await expect(breadcrumb(page).getByText("Board A", { exact: true })).toBeVisible()
  await expect(whiteboardTools(page)).toBeVisible()

  await addMedia(page, join(FIXTURES, "cobalt.png"))
  // The new node is selected once its file has arrived, which opens the
  // panel. The alt text is what a picture can be found by.
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  await expect(panel.getByRole("progressbar", { name: "Uploading picture" })).toHaveCount(0)
  const alt = `Cobalt square ${id}`
  await panel.getByLabel("Alt text").fill(alt)
  // The caption is the picture's title: what copy puts on the clipboard.
  const caption = `Pic ${id}`
  await panel.getByLabel("Caption").fill(caption)
  await expect(picture(page, alt)).toBeVisible()
  await expect(panel.getByText("64 × 48 px")).toBeVisible()
  await expectSaved(page)

  // Back from the database, the picture is served from Storage through a
  // signed address, not from the copy the uploader's tab kept.
  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(picture(page, alt)).toBeVisible()
  await expect
    .poll(() => picture(page, alt).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(64)

  // Copy here, paste on another whiteboard of the project. The whiteboard's
  // clipboard lives in the tab, so the other whiteboard is reached without
  // a full page load; the paste is heard as the browser's own event, which
  // a real key press raises.
  await clickPicture(page, alt)
  await expect(panel).toBeVisible()
  await expect(panel.getByLabel("Alt text")).toHaveValue(alt)
  await page.keyboard.press("ControlOrMeta+c")
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(caption)
  await treeLink(page, "Board B").click()
  await expect(breadcrumb(page).getByText("Board B", { exact: true })).toBeVisible()
  await expect(picture(page, alt)).toHaveCount(0)
  // The link keeps the focus, and the paste is heard only from the
  // whiteboard itself, so an empty spot of the canvas is pressed first.
  // The bottom right: the trail, the tools, the mode toggle and the zoom
  // controls float over the other corners.
  const sheet = await canvas(page).boundingBox()
  if (!sheet) throw new Error("The canvas has no box to press")
  await page.mouse.click(sheet.x + sheet.width - 60, sheet.y + sheet.height - 60)
  await page.keyboard.press("ControlOrMeta+v")
  // A pasted picture gets a file of its own on this whiteboard, so it is
  // there after a reload too.
  await expect(picture(page, alt)).toBeVisible()
  await expectSaved(page)
  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(picture(page, alt)).toBeVisible()
  await expect
    .poll(() => picture(page, alt).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(64)

  // Two pictures are stored now, and Settings still shows no meter: the
  // meter watches a cap, and this server sets none.
  await page.goto(`/${slug}/settings/general`)
  await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Storage", exact: true })).toHaveCount(0)
  await expect(page.getByRole("meter", { name: "Storage for pictures and videos" })).toHaveCount(0)
})

test("a picture over the size limit is refused with the limit in words, and nothing is added", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  // One byte over the 10 MB a picture can be (lib/whiteboard/media.ts).
  // It is refused before any of it is sent, so it need not be a real PNG.
  await addMedia(page, { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) })
  await expect(page.getByText("huge.png is larger than the 10 MB a picture can be.")).toBeVisible()
  // Not even a placeholder: the empty-sheet note is shown only while the
  // whiteboard holds nothing at all.
  await expect(page.getByRole("progressbar", { name: "Uploading picture" })).toHaveCount(0)
  await expect(page.getByText("An empty sheet")).toBeVisible()
})
