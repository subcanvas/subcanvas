import { expect, test, type Page } from "@playwright/test"

import {
  addNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { addTwoNodesApart, clickEdge, connectNodes, dragNode, edgeBetween } from "./support/canvas"

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

test("an arrow's label stays on top when a box is moved over it, as in the embed", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  // A third box first, parked below, out of the arrow's way.
  const cover = `Cover ${id}`
  await addNode(page, cover)
  await dragNode(page, cover, { x: 0, y: 220 })
  const { alpha, beta } = await twoNodesApart(page, id)
  await connectNodes(page, alpha, beta)
  await clickEdge(page, alpha, beta)
  const label = `crosses ${id}`
  await inspector(page).getByLabel("Label").fill(label)
  const pill = page.getByRole("application").getByText(label, { exact: true })
  await expect(pill).toBeVisible()
  await expectSaved(page)

  // Dragged so its middle sits on the label's middle. It is selected after
  // the drag, which React Flow draws above other nodes.
  const at = await pill.boundingBox()
  const box = await nodeLabelled(page, cover).boundingBox()
  await dragNode(page, cover, {
    x: at!.x + at!.width / 2 - (box!.x + box!.width / 2),
    y: at!.y + at!.height / 2 - (box!.y + box!.height / 2),
  })

  // The box is under the label now. Labels are drawn in a layer of their
  // own; it must stack above every node, the selected one included. (The
  // label takes no pointer, so hit-testing cannot tell what is on top.)
  await expect(nodeLabelled(page, cover)).toBeVisible()
  const order = await page.evaluate((title) => {
    const node = [...document.querySelectorAll<HTMLElement>(".react-flow__node")].find((el) =>
      el.querySelector(`[aria-label^="Box: ${title},"]`) ?? el.textContent?.includes(title)
    )!
    const labels = document.querySelector<HTMLElement>(".react-flow__edgelabel-renderer")!
    const z = (el: HTMLElement) => Number(getComputedStyle(el).zIndex) || 0
    return { node: z(node), labels: z(labels), sameParent: node.parentElement!.parentElement === labels.parentElement }
  }, cover)
  expect(order.sameParent).toBe(true)
  expect(order.labels).toBeGreaterThan(order.node)
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
