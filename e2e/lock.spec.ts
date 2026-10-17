import { expect, test, type Page } from "@playwright/test"

import {
  addFromMenu,
  addNode,
  clickNode,
  closePanel,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  fromMoreMenu,
  inspector,
  nodeDocument,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { boxOf, clickEmptyCanvas, drag, dragNode, expectDroppedNear, expectSamePlace, nodeNamed } from "./support/canvas"

// One hint from the bar under the canvas, which says what the keys do right
// now. The bar is a paragraph, and each hint in it is its key and its words
// in one span, so the words find it. (React Flow keeps its own help text
// for screen readers on the canvas too, which says "delete" as well.)
const hint = (page: Page, words: string) =>
  page.getByRole("application").getByRole("paragraph").getByText(words)

// Positions measured on screen carry sub-pixel rounding.
const expectClose = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)

const lockedBadge = (page: Page) => whiteboardTools(page).getByRole("button", { name: "Locked: click to unlock", exact: true })
const addButton = (page: Page) => whiteboardTools(page).getByRole("button", { name: "Add", exact: true })

// Someone who may edit is always editing. Locking is for keeping a finished
// layout: it holds for everyone with the whiteboard open, and the notes in
// its boxes can still be written.
test("a locked whiteboard keeps its boxes as they are for everyone, and its notes can still be written", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const board = page.url()

  const alpha = `Alpha ${id}`
  await addNode(page, alpha)
  await expectSaved(page)
  await inspector(page).getByRole("button", { name: "Write a description…" }).click()
  const editor = nodeDocument(page).getByRole("textbox")
  await editor.click()
  await page.keyboard.type("Before the lock.")
  await expect(nodeDocument(page).getByText("Saved", { exact: true })).toBeVisible()

  await fromMoreMenu(page, "Lock whiteboard")
  await expect(lockedBadge(page)).toBeVisible()
  await expect(addButton(page)).toHaveCount(0)
  // The panel left open names the box, and has nothing that would change
  // it, not even greyed out.
  await expect(inspector(page).getByRole("heading", { name: alpha })).toBeVisible()
  for (const control of ["Title", "Style the box"])
    await expect(inspector(page).getByLabel(control, { exact: true })).toHaveCount(0)
  // Its notes are a page of their own, still there to write in.
  await editor.click()
  await page.keyboard.press("End")
  await page.keyboard.type(" And after it.")
  await expect(editor).toContainText("Before the lock. And after it.")
  await expect(nodeDocument(page).getByText("Saved", { exact: true })).toBeVisible()
  await closePanel(page)

  // A real drag on the node, which would otherwise move it.
  const before = await boxOf(nodeNamed(page, alpha, "a document"))
  await dragNode(page, alpha, { x: 150, y: 100 })
  expectSamePlace(await boxOf(nodeNamed(page, alpha, "a document")), before)
  // Tab draws nothing.
  await clickEmptyCanvas(page)
  await page.keyboard.press("Tab")
  await expect(page.getByRole("application").getByRole("group", { name: /^Box: / })).toHaveCount(1)

  // Someone else with the whiteboard open sees it locked, and the note
  // written after the lock; then they unlock it.
  const other = await page.context().newPage()
  await other.goto(board)
  await expect(lockedBadge(other)).toBeVisible()
  await clickNode(other, alpha)
  await expect(nodeDocument(other).getByRole("textbox")).toContainText("Before the lock. And after it.")
  await lockedBadge(other).click()
  await expect(addButton(other)).toBeVisible()
  // Which reaches the first tab at once.
  await expect(addButton(page)).toBeVisible()
  await other.close()

  // Now a drag does move it.
  await dragNode(page, alpha, { x: 150, y: 100 })
  expectDroppedNear(await boxOf(nodeNamed(page, alpha, "a document")), { x: before.x + 150, y: before.y + 100 })
})

test("+ adds at the middle of the view, and a right-click on the canvas adds where it was pressed", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  // An empty whiteboard says how to start.
  await expect(hint(page, "Right-click to add more")).toBeVisible()

  await addFromMenu(page, "Text")
  await expect(inspector(page)).toBeVisible()
  await expect(page.getByRole("application").getByRole("group", { name: /^Text: / })).toHaveCount(1)
  await closePanel(page)

  // Low on the left, away from the text in the middle.
  const area = await boxOf(page.getByRole("application"))
  const at = { x: area.x + 160, y: area.y + area.height - 160 }
  await page.mouse.click(at.x, at.y, { button: "right" })
  await page.getByRole("menuitem", { name: "Box", exact: true }).click()
  const added = await boxOf(page.getByRole("application").getByRole("group", { name: "Box: Box", exact: true }))
  expect(Math.abs(added.x + added.width / 2 - at.x)).toBeLessThan(40)
  expect(Math.abs(added.y + added.height / 2 - at.y)).toBeLessThan(40)

  // A right-click on a box opens no menu of ours.
  await closePanel(page)
  await page.mouse.click(added.x + added.width / 2, added.y + added.height / 2, { button: "right" })
  await expect(page.getByRole("menuitem", { name: "Box", exact: true })).toHaveCount(0)
})

test("the shortcuts in the hint bar do what it says", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const alpha = `Alpha ${id}`
  await addNode(page, alpha)
  await closePanel(page)

  // Enter goes into the selected node: with nothing inside it, to its name,
  // typed on the box itself.
  await clickNode(page, alpha)
  await expect(hint(page, "rename")).toBeVisible()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveCount(0)

  // Esc clears the selection, which closes the panel.
  await clickNode(page, alpha)
  await page.keyboard.press("Escape")
  await expect(inspector(page)).toBeHidden()

  // With one box selected, the hint offers Tab, which draws the next box
  // (keyboard-drawing.spec.ts). The command key with D duplicates; the copy
  // has the same name, and is the selection afterwards.
  await clickNode(page, alpha)
  await expect(hint(page, "draw the next box")).toBeVisible()
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

  // Locked, the wheel still pans, and still moves nothing.
  await fromMoreMenu(page, "Lock whiteboard")
  await expect(lockedBadge(page)).toBeVisible()
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
