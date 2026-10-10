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
  signUpWithOrg,
} from "./support/app"
import { boxOf, edgeBetween, nodeNamed } from "./support/canvas"

// Drawing without the mouse (lib/whiteboard/keyboard-drawing.ts): Tab draws
// the next box to the right with an arrow to it, Shift+Tab one below fed by
// the same boxes, the name is typed on the box, and Alt with an arrow moves
// between boxes.

const nameField = (page: import("@playwright/test").Page) => page.getByRole("textbox", { name: "Name" })

test("a chain of boxes is drawn and named from the keyboard, and a column fans out of one", async ({ page }) => {
  const id = freshId().slice(0, 6)
  const [start, second, third, fork] = ["Start", "Second", "Third", "Fork"].map((name) => `${name} ${id}`)
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  await addNode(page, start)
  await closePanel(page)

  // Tab from a box: the next one, to its right, joined by an arrow, its name
  // ready to type. Tab again keeps the name and draws the one after.
  await clickNode(page, start)
  await page.keyboard.press("Tab")
  await expect(nameField(page)).toBeFocused()
  await page.keyboard.type(second)
  await page.keyboard.press("Tab")
  await page.keyboard.type(third)
  await page.keyboard.press("Enter")
  await expect(nameField(page)).toHaveCount(0)

  // The view follows the newest box, so the first arrows may be off screen:
  // they are looked for, not looked at.
  await expect(edgeBetween(page, start, second)).toHaveCount(1)
  await expect(edgeBetween(page, second, third)).toHaveCount(1)
  const [a, b, c] = await Promise.all([start, second, third].map((title) => boxOf(nodeNamed(page, title))))
  expect(b.x).toBeGreaterThan(a.x + a.width)
  expect(c.x).toBeGreaterThan(b.x + b.width)
  expect(Math.abs(b.y - a.y)).toBeLessThan(2)

  // Alt+Left goes back to Second; Shift+Tab draws below it, fed by what
  // feeds it, so Start now branches to two.
  await page.keyboard.press("Alt+ArrowLeft")
  await expect(inspector(page).getByLabel("Title")).toHaveValue(second)
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.type(fork)
  await page.keyboard.press("Enter")
  await expect(edgeBetween(page, start, fork)).toHaveCount(1)
  // Measured together: the view may have moved to follow the new box.
  const [above, d] = await Promise.all([second, fork].map((title) => boxOf(nodeNamed(page, title))))
  expect(d.y).toBeGreaterThan(above.y + above.height)
  expect(Math.abs(d.x - above.x)).toBeLessThan(2)

  // Tab, then Escape before typing: the box drawn a moment ago is taken
  // away again, with its arrow.
  await page.keyboard.press("Tab")
  await expect(nameField(page)).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(nameField(page)).toHaveCount(0)
  await expect(page.getByRole("group", { name: /^Box: / })).toHaveCount(4)
  await expect(page.getByRole("group", { name: new RegExp(`^Arrow from ${fork} to`) })).toHaveCount(0)

  // A double-click on a box with nothing inside renames it there, and
  // Escape puts the old name back.
  await nodeNamed(page, third).dblclick()
  await expect(nameField(page)).toHaveValue(third)
  await page.keyboard.type("Changed my mind")
  await page.keyboard.press("Escape")
  await expect(nodeNamed(page, third)).toBeVisible()

  // Everything drawn is one document like any other: it is there after a
  // reload.
  await expectSaved(page)
  await page.reload()
  await expect(edgeBetween(page, start, fork)).toHaveCount(1)
  await expect(edgeBetween(page, second, third)).toHaveCount(1)
})

test("? shows every shortcut beside the canvas, and it stays until it is hidden", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const sheet = page.getByRole("region", { name: "Keyboard shortcuts" })
  await expect(sheet).toHaveCount(0)

  await page.locator("body").press("?")
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText("Draw the next box to the right")).toBeVisible()

  // Kept open, from one visit to the next.
  await page.reload()
  await expect(sheet).toBeVisible()
  await sheet.getByRole("button", { name: "Hide the shortcuts" }).click()
  await expect(sheet).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole("toolbar", { name: "Whiteboard tools" })).toBeVisible()
  await expect(sheet).toHaveCount(0)
})
