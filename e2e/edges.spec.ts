import { expect, test, type Page } from "@playwright/test"

import {
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { addTwoNodesApart, clickEdge, connectNodes, edgeBetween } from "./support/canvas"

// Two nodes, apart, ready to be joined.
async function twoNodesApart(page: Page, id: string) {
  const alpha = `Alpha ${id}`
  const beta = `Beta ${id}`
  await addTwoNodesApart(page, alpha, beta)
  return { alpha, beta }
}

test("an arrow drawn from one node's edge to another is there after a reload", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const { alpha, beta } = await twoNodesApart(page, id)

  await connectNodes(page, alpha, beta)
  await expectSaved(page)

  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(edgeBetween(page, alpha, beta)).toBeVisible()
  await expect(nodeLabelled(page, alpha)).toBeVisible()
  await expect(nodeLabelled(page, beta)).toBeVisible()
})

test("an arrow takes a label in the panel, and keeps it", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const { alpha, beta } = await twoNodesApart(page, id)
  await connectNodes(page, alpha, beta)

  await clickEdge(page, alpha, beta)
  const label = `leads to ${id}`
  await inspector(page).getByLabel("Label").fill(label)

  // The label becomes part of the arrow's name, and shows on the canvas in a
  // pill of its own, which React Flow draws apart from the line.
  await expect(edgeBetween(page, alpha, beta, `labelled ${label}`)).toBeVisible()
  await expect(page.getByRole("application").getByText(label, { exact: true })).toBeVisible()
  await expectSaved(page)

  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(edgeBetween(page, alpha, beta, `labelled ${label}`)).toBeVisible()
  await clickEdge(page, alpha, beta)
  await expect(inspector(page).getByLabel("Label")).toHaveValue(label)
})

test("a selected arrow goes with the Delete key, and comes back with undo", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const { alpha, beta } = await twoNodesApart(page, id)
  await connectNodes(page, alpha, beta)
  await expectSaved(page)

  await clickEdge(page, alpha, beta)
  await page.keyboard.press("Delete")
  await expect(edgeBetween(page, alpha, beta)).toHaveCount(0)
  // Only the arrow went: the nodes it joined are still there.
  await expect(nodeLabelled(page, alpha)).toBeVisible()
  await expect(nodeLabelled(page, beta)).toBeVisible()
  // The panel was showing the arrow, and there is no arrow to show.
  await expect(inspector(page)).toBeHidden()

  // The deletion is one step, and undo is the command key with Z, as the
  // tools' own hint says. The focus is on the page body after the press.
  await page.keyboard.press("ControlOrMeta+z")
  await expect(edgeBetween(page, alpha, beta)).toBeVisible()
  await expectSaved(page)

  // Undone for good, not just on this screen.
  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(edgeBetween(page, alpha, beta)).toBeVisible()
})
