import { expect, test } from "@playwright/test"

import {
  addNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import {
  addGroup,
  boxOf,
  centerOf,
  contains,
  drag,
  dragNode,
  expectSamePlace,
  groupNamed,
  nodeNamed,
} from "./support/canvas"

// A group is a frame that moves what is inside it (R3.9), and a node goes
// in and out of one by being dragged there (R3.11). There is no setting for
// how a group looks: every group is a frame with no fill, so the nodes under
// it stay within reach.
test("a node dragged into a group moves with the group, until it is dragged out", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const alpha = `Alpha ${id}`
  await addNode(page, alpha)
  // Out of the middle, where the group is about to be added.
  await dragNode(page, alpha, { x: -300, y: 0 })

  const frame = `Frame ${id}`
  await addGroup(page, frame)
  const group = groupNamed(page, frame)
  const node = nodeNamed(page, alpha)
  expect(contains(await boxOf(group), await boxOf(node))).toBe(false)

  // Beside the group, the node is not the group's: the group moves alone.
  const alone = await boxOf(node)
  await dragNode(page, frame, { x: 0, y: 60 })
  expectSamePlace(await boxOf(node), alone)

  // Into the group. Dropping a node with its middle over a group puts it in.
  await drag(page, centerOf(await boxOf(node)), centerOf(await boxOf(group)))
  expect(contains(await boxOf(group), await boxOf(node))).toBe(true)

  // Now it comes along.
  const before = await boxOf(node)
  await dragNode(page, frame, { x: 150, y: 90 })
  expectSamePlace(await boxOf(node), { x: before.x + 150, y: before.y + 90 })
  await expectSaved(page)

  // The belonging is saved, not just the places: after a reload the node is
  // still inside, and still follows the group.
  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  expect(contains(await boxOf(group), await boxOf(node))).toBe(true)
  const reloaded = await boxOf(node)
  await dragNode(page, frame, { x: -100, y: -40 })
  expectSamePlace(await boxOf(node), { x: reloaded.x - 100, y: reloaded.y - 40 })

  // Out again: dragged clear of the frame, the node is its own once more.
  const groupBox = await boxOf(group)
  const nodeBox = await boxOf(node)
  await drag(page, centerOf(nodeBox), { x: groupBox.x - 160, y: centerOf(nodeBox).y })
  expect(contains(await boxOf(group), await boxOf(node))).toBe(false)
  const outside = await boxOf(node)
  await dragNode(page, frame, { x: 0, y: 40 })
  expectSamePlace(await boxOf(node), outside)
  await expect(nodeLabelled(page, alpha)).toBeVisible()
})
