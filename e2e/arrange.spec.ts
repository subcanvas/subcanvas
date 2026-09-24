import { expect, test } from "@playwright/test"

import {
  addNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { boxOf, clickEmptyCanvas, disjoint, expectSamePlace, nodeNamed, type Box } from "./support/canvas"

// Arrange lays the selected nodes out so that none overlaps another. The
// toolbar adds nodes almost on top of each other, which is exactly the
// pile it is for.
test("Arrange spreads a pile of nodes apart, and undo puts them back", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const titles = ["Alpha", "Beta", "Gamma"].map((name) => `${name} ${id}`)
  for (const title of titles) await addNode(page, title)
  await expectSaved(page)
  await clickEmptyCanvas(page)

  // The nodes' own boxes, not their labels': a label is a line of text in
  // the middle of its node, and the labels of a pile need not touch.
  const boxes = async () => {
    const all: Box[] = []
    for (const title of titles) all.push(await boxOf(nodeNamed(page, title)))
    return all
  }
  const overlapping = (all: Box[]) =>
    all.some((a, i) => all.some((b, j) => i < j && !disjoint(a, b)))

  const piled = await boxes()
  expect(overlapping(piled)).toBe(true)

  // Arrange works on a selection of more than one, and the toolbar for a
  // selection is where the tool is.
  await page.keyboard.press("ControlOrMeta+a")
  const selected = page.getByRole("toolbar", { name: "Selected nodes" })
  await expect(selected).toContainText("3 selected")
  await selected.getByRole("button", { name: "Arrange" }).click()

  await expect(async () => expect(overlapping(await boxes())).toBe(false)).toPass()
  const spread = await boxes()

  // The whole arrangement is one step back.
  await page.keyboard.press("ControlOrMeta+z")
  await expect(async () => {
    const back = await boxes()
    back.forEach((box, index) => expectSamePlace(box, piled[index]))
  }).toPass()

  // And one step forward again.
  await page.keyboard.press("ControlOrMeta+Shift+z")
  await expect(async () => {
    const again = await boxes()
    again.forEach((box, index) => expectSamePlace(box, spread[index]))
  }).toPass()
  await expectSaved(page)

  // The arrangement is what was saved.
  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  expect(overlapping(await boxes())).toBe(false)
})

// The shortcut the hint bar offers for it.
test("Shift+A arranges the selection too", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const alpha = `Alpha ${id}`
  const beta = `Beta ${id}`
  await addNode(page, alpha)
  await addNode(page, beta)
  await clickEmptyCanvas(page)
  await page.keyboard.press("ControlOrMeta+a")
  expect(disjoint(await boxOf(nodeNamed(page, alpha)), await boxOf(nodeNamed(page, beta)))).toBe(false)

  await page.keyboard.press("Shift+a")
  await expect(async () =>
    expect(disjoint(await boxOf(nodeNamed(page, alpha)), await boxOf(nodeNamed(page, beta)))).toBe(true)
  ).toPass()
})
