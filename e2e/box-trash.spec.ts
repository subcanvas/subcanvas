import { expect, test, type Page } from "@playwright/test"

import {
  addNode,
  clickNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  nodeDocument,
  nodeLabelled,
  personalSlug,
  signIn,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { nodeNamed } from "./support/canvas"
import { clickCanvas } from "./support/collab"

// Deleting a box means what deleting means everywhere inside a project:
// what it held goes to the trash, with everything nested in it, and comes
// back from there. Undo on the canvas brings back exactly that.

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

const trashRow = (page: Page, title: string) => page.getByRole("main").getByRole("listitem").filter({ hasText: title })

test("deleting a box sends the whiteboard inside it to the trash, and undo brings it back", async ({ page }) => {
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

  // The panel's own control, which a touch screen has too.
  await inspector(page).getByRole("button", { name: "Delete box" }).click()
  await expect(nodeLabelled(page, inner)).toHaveCount(0)
  await expect(page.getByText(`“${inner}” is in the trash`)).toBeVisible()
  await expect(treeRow(page, inner)).toHaveCount(0)

  await whiteboardTools(page).getByRole("button", { name: "Undo" }).click()
  await expect(nodeLabelled(page, inner)).toBeVisible()
  await expect(treeRow(page, inner)).toBeVisible()

  // The Delete key does the same, and from the trash the whiteboard comes
  // back under the one it was on, since its box is gone for good.
  await clickNode(page, inner)
  await clickCanvas(page)
  await clickNode(page, inner)
  await page.keyboard.press("Delete")
  await expect(nodeLabelled(page, inner)).toHaveCount(0)
  await expect(treeRow(page, inner)).toHaveCount(0)
  await expectSaved(page)

  await openTrash(page)
  const row = trashRow(page, inner)
  await expect(row).toContainText("Whiteboard")
  await row.getByRole("button", { name: "Restore" }).click()
  await expect(page.getByText("Restored under the whiteboard it was on")).toBeVisible()
  await page.goto(board)
  await expandInTree(page, top)
  await expect(treeRow(page, inner)).toBeVisible()
})

test("a box's description goes to the trash with it, and comes back as a page of its own", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  const top = `Top ${id}`
  await createWhiteboard(page, top)

  const box = `API ${id}`
  await addNode(page, box)
  await inspector(page).getByRole("button", { name: "Write a description…" }).click()
  const editor = nodeDocument(page).getByRole("textbox")
  await editor.click()
  await page.keyboard.type("Rate limited per key.")
  await expectSaved(nodeDocument(page))

  await inspector(page).getByRole("button", { name: "Delete box" }).click()
  await expect(page.getByText(`“${box}” is in the trash`)).toBeVisible()
  await expectSaved(page)

  await openTrash(page)
  const row = trashRow(page, box)
  await expect(row).toContainText("Description of a box or arrow")
  await row.getByRole("button", { name: "Restore" }).click()
  await expect(page.getByText("Restored under the whiteboard it was on")).toBeVisible()
  await expect(page.getByText("The trash is empty.")).toBeVisible()

  // A page now, in the tree under the whiteboard, with what was written.
  await expandInTree(page, top)
  await treeRow(page, box).click()
  await expect(page.getByText("Rate limited per key.")).toBeVisible()
})

test.describe("on a phone", () => {
  test("a box is deleted from its panel, the same way as with the Delete key", async ({ page, browser, baseURL }) => {
    // Two people's worth of signing in.
    test.setTimeout(150_000)
    const id = freshId()
    const { account } = await signUpWithOrg(page)
    await createProject(page, "Proj")
    const top = `Top ${id}`
    await createWhiteboard(page, top)
    const board = page.url()
    const inner = `Tapped ${id}`
    await addNode(page, inner)
    await inspector(page).getByRole("button", { name: "New whiteboard inside" }).click()
    await expect(inspector(page).getByText("A whiteboard. Click to go inside.")).toBeVisible()
    await expectSaved(page)

    const phone = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    try {
      const touch = await phone.newPage()
      await signIn(touch, account)
      // Signing in lands in the personal workspace; the board is in the team one.
      await touch.waitForURL(`/${personalSlug(account)}`)
      await touch.goto(board)
      // A finger starts in view mode, where nothing can be deleted.
      await touch.getByRole("button", { name: "Edit mode" }).tap()
      // The node, not its label: the box's outline lies over the words.
      await nodeNamed(touch, inner, "a whiteboard").tap()
      const panel = inspector(touch)
      await expect(panel).toBeVisible()
      await panel.getByRole("button", { name: "Delete box" }).tap()
      await expect(nodeLabelled(touch, inner)).toHaveCount(0)
      await expect(touch.getByText(`“${inner}” is in the trash`)).toBeVisible()
    } finally {
      await phone.close()
    }
  })
})
