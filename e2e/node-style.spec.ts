import { expect, test } from "@playwright/test"

import {
  addNode,
  clickNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { boxOf, nodeNamed } from "./support/canvas"

// The panel's choices for a node (R4.4): its shape, its colour, and the icon
// and emoji it wears. Each shows on the canvas at once, and all survive a
// reload.
test("a node's shape, colour, icon and emoji are chosen in the panel and kept", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const title = `Styled ${id}`
  await addNode(page, title)
  const panel = inspector(page)
  const node = nodeNamed(page, title)

  // Shape. A node still at its shape's own size takes the new shape's size,
  // and a diamond needs more room than a rectangle for the same words.
  const rectangle = await boxOf(node)
  await panel.getByRole("radiogroup", { name: "Shape" }).getByRole("radio", { name: "Diamond" }).click()
  await expect(panel.getByRole("radio", { name: "Diamond" })).toBeChecked()
  await expect(panel.getByText("Shape Diamond")).toBeVisible()
  await expect(async () => {
    const diamond = await boxOf(node)
    expect(diamond.width).toBeGreaterThan(rectangle.width)
    expect(diamond.height).toBeGreaterThan(rectangle.height)
  }).toPass()

  // Colour. The colour is drawn, not written: the one place it can be read
  // back on the canvas is the stroke of the node's outline.
  await panel.getByRole("radiogroup", { name: "Color" }).getByRole("radio", { name: "Blue" }).click()
  await expect(panel.getByRole("radio", { name: "Blue" })).toBeChecked()
  await expect(panel.getByText("Color Blue")).toBeVisible()
  const outline = node.locator("svg path").first()
  await expect(outline).toHaveAttribute("stroke", "#0b7fe0")

  // Icon, from the searchable list. It shows on the node as a small sheet
  // of its own, named for a screen reader.
  await panel.getByRole("button", { name: "Choose icon" }).click()
  await panel.getByLabel("Search icons").fill("database")
  await panel.getByRole("button", { name: "Database", exact: true }).click()
  await expect(node.getByRole("img", { name: "Icon: Database" })).toBeVisible()
  await expect(panel.getByRole("button", { name: "Database", exact: true, pressed: true })).toBeVisible()

  // Emoji, the same way.
  await panel.getByRole("button", { name: "Choose emoji" }).click()
  await panel.getByLabel("Search emoji").fill("rocket")
  await panel.getByRole("button", { name: "rocket launch ship deploy" }).click()
  await expect(node.getByText("🚀")).toBeVisible()

  await expectSaved(page)
  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()

  // All four are drawn from the database, before anything is selected.
  await expect(node.getByRole("img", { name: "Icon: Database" })).toBeVisible()
  await expect(node.getByText("🚀")).toBeVisible()
  await expect(outline).toHaveAttribute("stroke", "#0b7fe0")
  const reloaded = await boxOf(node)
  expect(reloaded.width).toBeGreaterThan(rectangle.width)

  // And the panel agrees with the canvas.
  await clickNode(page, title)
  await expect(panel.getByRole("radio", { name: "Diamond" })).toBeChecked()
  await expect(panel.getByRole("radio", { name: "Blue" })).toBeChecked()
  // The closed pickers name what was chosen.
  await expect(panel.getByRole("button", { name: "Database", exact: true })).toBeVisible()
  await expect(panel.getByRole("button", { name: /rocket/ })).toBeVisible()

  // A choice can be taken off again.
  await panel.getByRole("button", { name: "Remove emoji" }).click()
  await expect(node.getByText("🚀")).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "Choose emoji" })).toBeVisible()
})
