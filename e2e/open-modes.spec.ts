import { expect, test } from "@playwright/test"

import {
  addNode,
  clickNode,
  closePanel,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  nodeDocument,
  openStyle,
  signUpWithOrg,
} from "./support/app"
import { clickEmptyCanvas, nodeNamed } from "./support/canvas"

// How a box's page opens is the box's own setting (R4.8): in the side panel
// beside the whiteboard, in a pop-up over it, or as a page of its own.
test("a box's page opens the way the box says: side panel, pop-up, or full page", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const board = page.url()

  const title = `Lecture ${id}`
  await addNode(page, title)
  await inspector(page).getByRole("button", { name: "Write a description…" }).click()
  const editor = nodeDocument(page).getByRole("textbox")
  await editor.click()
  await page.keyboard.type("Neurons fire all or nothing.")
  await expect(nodeDocument(page).getByText("Saved", { exact: true })).toBeVisible()

  // Side panel, the default: the page is written in right in the panel.
  const style = await openStyle(page)
  const opensIn = style.getByRole("group", { name: "Its page opens in" })
  await expect(opensIn.getByRole("button", { name: "Side panel" })).toHaveAttribute("aria-pressed", "true")

  // Pop-up: the panel shows a card for the page instead, and a double click
  // on the box opens it over the whiteboard, there to write in.
  await opensIn.getByRole("button", { name: "Pop-up" }).click()
  await page.keyboard.press("Escape")
  await expect(inspector(page).getByText("A page. Click to open it in a pop-up.")).toBeVisible()
  await expect(nodeDocument(page).getByRole("textbox")).toHaveCount(0)
  await expectSaved(page)
  await closePanel(page)
  await nodeNamed(page, title, "a document").dblclick()
  const peek = page.getByRole("dialog", { name: title })
  await expect(peek.getByText("Neurons fire all or nothing.")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(peek).toBeHidden()
  await expect(page).toHaveURL(board)

  // The card in the panel opens it the same way. (The panel was closed
  // above, which lasts until the selection leaves the box.)
  await clickEmptyCanvas(page)
  await clickNode(page, title)
  await inspector(page).getByText("A page. Click to open it in a pop-up.").click()
  await expect(peek).toBeVisible()
  await page.keyboard.press("Escape")

  // Full page: Enter on the selected box goes to the page, and the trail
  // leads back.
  await clickNode(page, title)
  const again = await openStyle(page)
  await again.getByRole("group", { name: "Its page opens in" }).getByRole("button", { name: "Full page" }).click()
  await page.keyboard.press("Escape")
  await expect(inspector(page).getByText("A page. Click to open it full screen.")).toBeVisible()
  await expectSaved(page)
  await clickNode(page, title)
  await page.keyboard.press("Enter")
  await expect(page).not.toHaveURL(board)
  await expect(page.getByText("Neurons fire all or nothing.")).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)
})
