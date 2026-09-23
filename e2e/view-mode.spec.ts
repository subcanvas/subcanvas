import { expect, test, type Page } from "@playwright/test"

import {
  addNode,
  clickNode,
  closePanel,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { boxOf, clickEmptyCanvas, drag, dragNode, expectSamePlace, nodeNamed } from "./support/canvas"

const modeToggle = (page: Page) => page.getByRole("group", { name: "Whiteboard mode" })

// One hint from the bar under the canvas, which says what the keys do right
// now. The bar is a paragraph, and each hint in it is its key and its words
// in one span, so the words find it. (React Flow keeps its own help text
// for screen readers on the canvas too, which says "delete" as well.)
const hint = (page: Page, words: string) =>
  page.getByRole("application").getByRole("paragraph").getByText(words)

// Positions measured on screen carry sub-pixel rounding.
const expectClose = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)

// View mode is for looking: someone who may edit switches to it so that a
// stray drag changes nothing.
test("in view mode the tools are gone and a drag moves nothing, and E is the way back", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const alpha = `Alpha ${id}`
  await addNode(page, alpha)
  await expectSaved(page)
  await closePanel(page)

  await modeToggle(page).getByRole("button", { name: "View mode" }).click()
  await expect(modeToggle(page).getByRole("button", { name: "View mode" })).toHaveAttribute("aria-pressed", "true")
  await expect(whiteboardTools(page)).toHaveCount(0)
  // The hint bar says how to get back.
  await expect(hint(page, "to edit")).toBeVisible()

  // A real drag on the node, which in edit mode would move it.
  const before = await boxOf(nodeNamed(page, alpha))
  await dragNode(page, alpha, { x: 150, y: 100 })
  expectSamePlace(await boxOf(nodeNamed(page, alpha)), before)
  // Nothing was written: the badge never left "Saved".
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  // E, as the hint says, with the focus on the toggle just pressed.
  await page.keyboard.press("e")
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(modeToggle(page).getByRole("button", { name: "Edit mode" })).toHaveAttribute("aria-pressed", "true")

  // And E again, from the canvas, is the way out.
  await clickEmptyCanvas(page)
  await page.keyboard.press("e")
  await expect(whiteboardTools(page)).toHaveCount(0)

  // Now a drag does move it.
  await modeToggle(page).getByRole("button", { name: "Edit mode" }).click()
  await expect(whiteboardTools(page)).toBeVisible()
  await dragNode(page, alpha, { x: 150, y: 100 })
  expectSamePlace(await boxOf(nodeNamed(page, alpha)), { x: before.x + 150, y: before.y + 100 })
})

test("the shortcuts in the hint bar do what it says", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const alpha = `Alpha ${id}`
  await addNode(page, alpha)
  await closePanel(page)

  // Enter goes into the selected node: with nothing inside it, to its name.
  await clickNode(page, alpha)
  await expect(hint(page, "or double-click to open")).toBeVisible()
  await page.keyboard.press("Enter")
  await expect(inspector(page).getByLabel("Title")).toBeFocused()

  // Esc clears the selection, which closes the panel.
  await clickNode(page, alpha)
  await page.keyboard.press("Escape")
  await expect(inspector(page)).toBeHidden()

  // The command key with D duplicates. The copy has the same name, and is
  // the selection afterwards.
  await clickNode(page, alpha)
  await expect(hint(page, "duplicate")).toBeVisible()
  await page.keyboard.press("ControlOrMeta+d")
  await expect(nodeLabelled(page, alpha)).toHaveCount(2)

  // With both selected the hint offers the arrows, which nudge. The focus
  // has to be on the page body for that: on a node, React Flow's own arrow
  // keys take over. The command key with A selects everything.
  await clickEmptyCanvas(page)
  await page.keyboard.press("ControlOrMeta+a")
  await expect(hint(page, "nudge")).toBeVisible()
  const [first, second] = await Promise.all([
    boxOf(nodeLabelled(page, alpha).first()),
    boxOf(nodeLabelled(page, alpha).last()),
  ])
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Shift+ArrowDown")
  await expect(async () => {
    expectSamePlace(await boxOf(nodeLabelled(page, alpha).first()), { x: first.x + 5, y: first.y + 20 })
    expectSamePlace(await boxOf(nodeLabelled(page, alpha).last()), { x: second.x + 5, y: second.y + 20 })
  }).toPass()

  // Delete takes the selection away: both of them.
  await expect(hint(page, "delete")).toBeVisible()
  await page.keyboard.press("Delete")
  await expect(nodeLabelled(page, alpha)).toHaveCount(0)

  // And undo brings both back.
  await page.keyboard.press("ControlOrMeta+z")
  await expect(nodeLabelled(page, alpha)).toHaveCount(2)
})

test("the wheel pans and zooms the view without moving a node", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const alpha = `Alpha ${id}`
  const beta = `Beta ${id}`
  await addNode(page, alpha)
  await addNode(page, beta)
  await expectSaved(page)
  await closePanel(page)

  const offset = async () => {
    const a = await boxOf(nodeNamed(page, alpha))
    const b = await boxOf(nodeNamed(page, beta))
    return { x: b.x - a.x, y: b.y - a.y, width: a.width }
  }
  const before = await boxOf(nodeNamed(page, alpha))
  const apart = await offset()

  // Over the canvas, the wheel pans: everything on screen shifts together.
  await clickEmptyCanvas(page)
  await page.mouse.wheel(0, 120)
  await expect(async () => {
    const after = await boxOf(nodeNamed(page, alpha))
    expect(after.y).not.toBe(before.y)
  }).toPass()
  const panned = await offset()
  expectClose(panned.x, apart.x)
  expectClose(panned.y, apart.y)

  // A pinch zooms. A trackpad pinch reaches the page as the wheel with Ctrl
  // held, whatever the platform. The nodes get smaller, and stay as far
  // apart in their own coordinates.
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, 200)
  await page.keyboard.up("Control")
  await expect(async () => {
    const zoomed = await offset()
    expect(zoomed.width).toBeLessThan(apart.width)
  }).toPass()

  // None of that was a change to the whiteboard.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  const reloaded = await offset()
  expectClose(reloaded.x, apart.x)
  expectClose(reloaded.y, apart.y)

  // In view mode the wheel still pans, and still moves nothing.
  await modeToggle(page).getByRole("button", { name: "View mode" }).click()
  await expect(whiteboardTools(page)).toHaveCount(0)
  const box = await boxOf(page.getByRole("application"))
  await page.mouse.move(box.x + 40, box.y + 120)
  await page.mouse.wheel(0, -80)
  const looked = await offset()
  expectClose(looked.x, apart.x)
  expectClose(looked.y, apart.y)
  // A drag on the empty canvas draws a selection, never a move.
  await drag(page, { x: box.x + 40, y: box.y + 120 }, { x: box.x + 400, y: box.y + 500 })
  const selected = await offset()
  expectClose(selected.x, apart.x)
  expectClose(selected.y, apart.y)
})
