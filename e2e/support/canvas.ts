import { expect, type Locator, type Page } from "@playwright/test"

import { addNode, closePanel, inspector, nodeLabelled, whiteboardTools } from "./app"

// The canvas as a place things are moved around on: nodes and arrows found
// by what a screen reader would call them, and a real mouse for everything
// React Flow hands to d3-drag (see clickNode in app.ts for why).

export type Point = { x: number; y: number }
export type Box = Point & { width: number; height: number }

const canvas = (page: Page) => page.getByRole("application")

// React Flow gives every node and every edge the group role, with the label
// the app writes for it: "Node: Alpha", "Group: Frame", "Arrow from Alpha to
// Beta". An object that holds a document says so at the end of its name,
// which is also how a test knows a node has a whiteboard inside.
const objectNamed = (page: Page, name: string | RegExp) =>
  canvas(page).getByRole("group", { name, exact: true })

export const nodeNamed = (page: Page, title: string, holds?: "a whiteboard" | "a document") =>
  objectNamed(page, `Node: ${title}${holds ? `, holds ${holds}` : ""}`)

export const groupNamed = (page: Page, title: string) => objectNamed(page, `Group: ${title}`)

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// An arrow is named by the nodes it joins, then by its label and its
// document if it has them: "Arrow from A to B, labelled why, holds a
// document". Without `rest` the regex takes it whatever comes after.
export const edgeBetween = (page: Page, from: string, to: string, rest?: string) =>
  objectNamed(
    page,
    rest
      ? `Arrow from ${from} to ${to}, ${rest}`
      : new RegExp(`^Arrow from ${escape(from)} to ${escape(to)}(,|$)`)
  )

export async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  if (!box) throw new Error("The element has no box on screen")
  return box
}

export const centerOf = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

// How far the pointer goes before React Flow calls a press a drag: one
// pixel is its threshold, and it measures the drag from wherever the pointer
// was when it crossed it.
const DRAG_START = 2

// A drag with the real mouse, in steps, so d3-drag sees a press, movement
// past the threshold, and a release, the way it would from a hand. The first
// step only starts the drag and moves nothing, so it is added back at the
// end: what is dragged lands exactly `to` minus `from` from where it was.
export async function drag(page: Page, from: Point, to: Point) {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1
  const unit = { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
  const end = { x: to.x + unit.x * DRAG_START, y: to.y + unit.y * DRAG_START }
  await page.mouse.move(from.x, from.y, { steps: 8 })
  await page.mouse.down()
  await page.mouse.move(from.x + unit.x * DRAG_START, from.y + unit.y * DRAG_START)
  await page.mouse.move((from.x + end.x) / 2, (from.y + end.y) / 2, { steps: 6 })
  await page.mouse.move(end.x, end.y, { steps: 6 })
  await page.mouse.up()
}

// Moves a node by dragging it from its label. A group's label is the tab on
// its top edge, which is the one part of a group's inside that takes the
// pointer (its frame is the other), so this works for groups too.
export async function dragNode(page: Page, title: string, by: Point) {
  const from = centerOf(await boxOf(nodeLabelled(page, title)))
  await drag(page, from, { x: from.x + by.x, y: from.y + by.y })
}

// Two nodes with room between them for an arrow. The toolbar puts each new
// node in the middle of the view, one on top of the other, so the first is
// dragged to the left of where the second will land. Left, not right: the
// panel is open while a node is selected, and takes the right of the view.
export async function addTwoNodesApart(page: Page, first: string, second: string) {
  await addNode(page, first)
  await dragNode(page, first, { x: -300, y: 0 })
  await addNode(page, second)
}

// Draws an arrow from `from` to `to` by dragging from the handle on the
// right side of one to the handle on the left side of the other. A handle
// sits centred on its node's edge, so the edge's midpoint is the handle.
export async function connectNodes(page: Page, from: string, to: string) {
  const source = await boxOf(nodeNamed(page, from))
  const target = await boxOf(nodeNamed(page, to))
  await drag(
    page,
    { x: source.x + source.width, y: source.y + source.height / 2 },
    { x: target.x, y: target.y + target.height / 2 }
  )
  await expect(edgeBetween(page, from, to)).toBeVisible()
}

// Selects an arrow by pressing on it. Its box is the box of the curve, and a
// curve between two nodes is symmetric about its midpoint, so the middle of
// the box lies on the line; the app widens the line's hit area anyway.
export async function clickEdge(page: Page, from: string, to: string) {
  const at = centerOf(await boxOf(edgeBetween(page, from, to)))
  await page.mouse.move(at.x, at.y, { steps: 8 })
  await page.mouse.down()
  await page.mouse.up()
  await expect(inspector(page).getByText("Arrow", { exact: true })).toBeVisible()
}

// A press on empty canvas, which clears the selection and leaves the focus
// on the page body, where the canvas's own shortcuts are heard. The spot is
// under the trail of sheets in the top-left corner, where nothing is added:
// new objects land in the middle.
export async function clickEmptyCanvas(page: Page) {
  const box = await boxOf(canvas(page))
  await page.mouse.click(box.x + 40, box.y + 120)
  await expect(inspector(page)).toBeHidden()
}

// Adds a group from the toolbar and names it, the way addNode adds a node.
export async function addGroup(page: Page, title: string) {
  await closePanel(page)
  await whiteboardTools(page).getByRole("button", { name: "Group", exact: true }).click()
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  await panel.getByLabel("Title").fill(title)
  await expect(nodeLabelled(page, title)).toBeVisible()
}

// Goes into the whiteboard a node holds by double-clicking the node, and
// waits for the page inside to be up. The way in is in the address: the
// trail travels there as `via`.
export async function openInside(page: Page, title: string) {
  const at = centerOf(await boxOf(nodeLabelled(page, title)))
  await page.mouse.move(at.x, at.y, { steps: 8 })
  await page.mouse.dblclick(at.x, at.y)
  await page.waitForURL(/via=/)
  await expect(whiteboardTools(page)).toBeVisible()
}

// Gives the selected object a whiteboard of its own, through the panel. The
// panel then shows the card for what is inside; the link itself is content
// of the board, so the caller waits for the board to save.
export async function createWhiteboardInside(page: Page) {
  const panel = inspector(page)
  await panel.getByRole("button", { name: "New whiteboard inside" }).click()
  await expect(panel.getByText("A whiteboard. Click to go inside.")).toBeVisible()
}

// The whiteboard's own badge, in its header, which is the first live region
// on the page: a document open in the panel has a badge of its own further
// down, and page.getByText("Saved") would find both. Watching this one
// through "Saving…" and "Saved" is the wait for the board itself.
export async function expectBoardSaved(page: Page) {
  const badge = page.getByRole("main").locator("[aria-live=polite]").first()
  await expect(badge).toHaveText("Saving…")
  await expect(badge).toHaveText("Saved")
}

// Two boxes with no overlap, allowing a hair for rounding.
export const disjoint = (a: Box, b: Box) =>
  a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1

export const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

// Positions measured on screen carry sub-pixel rounding, so two of them are
// the same when they are within a pixel.
export function expectSamePlace(actual: Box, expected: Point) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1)
}
