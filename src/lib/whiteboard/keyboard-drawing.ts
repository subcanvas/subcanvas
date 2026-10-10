import type { Side } from "./shapes"

// Drawing from the keyboard: Tab makes the next box to the right of the
// selected one, Shift+Tab one below it, and Alt with an arrow moves the
// selection to the nearest box that way. Where a new box goes, and which box
// is nearest, are worked out here as plain geometry, so the canvas only has
// to ask.

export type Box = { x: number; y: number; width: number; height: number }
export type Direction = "left" | "right" | "up" | "down"

// Room between a box and the one made from it: enough for an arrow and its
// label across, less down a column. With a box of the default size (160 by
// 64) on the sheet's 20-point grid, the next one lands on it too.
export const GAP_ACROSS = 80
export const GAP_DOWN = 36
// How close two boxes may come before one is said to be in the other's way.
const CLEARANCE = 16

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width + CLEARANCE &&
  b.x < a.x + a.width + CLEARANCE &&
  a.y < b.y + b.height + CLEARANCE &&
  b.y < a.y + a.height + CLEARANCE

// Where a new box of `size` goes: beside `from`, to the right or below,
// lined up with it. A box already there pushes it on, down the column for a
// box to the right and along the row for one below, so the boxes made from
// one box fan out without landing on anything.
export function placeNext(
  from: Box,
  others: Box[],
  direction: "right" | "below",
  size: { width: number; height: number }
): { x: number; y: number } {
  const spot =
    direction === "right"
      ? { x: from.x + from.width + GAP_ACROSS, y: from.y + (from.height - size.height) / 2, ...size }
      : { x: from.x + (from.width - size.width) / 2, y: from.y + from.height + GAP_DOWN, ...size }
  // Bounded, so a whiteboard packed solid still gets its box somewhere.
  for (let tries = 0; tries < 500 && others.some((other) => overlaps(spot, other)); tries++) {
    if (direction === "right") spot.y += size.height + GAP_DOWN
    else spot.x += size.width + GAP_ACROSS
  }
  return { x: spot.x, y: spot.y }
}

// The box nearest `from` in a direction: among the boxes whose middle lies
// that way, within 60 degrees either side of it, the one closest along it,
// with straying sideways counting double. Null when there is none.
export function nearestBox<T extends Box>(from: Box, others: T[], direction: Direction): T | null {
  const middle = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  const start = middle(from)
  const [ahead, aside] = {
    left: [(d: { x: number; y: number }) => -d.x, (d: { x: number; y: number }) => d.y],
    right: [(d: { x: number; y: number }) => d.x, (d: { x: number; y: number }) => d.y],
    up: [(d: { x: number; y: number }) => -d.y, (d: { x: number; y: number }) => d.x],
    down: [(d: { x: number; y: number }) => d.y, (d: { x: number; y: number }) => d.x],
  }[direction]
  let best: { box: T; score: number } | null = null
  for (const box of others) {
    const end = middle(box)
    const delta = { x: end.x - start.x, y: end.y - start.y }
    const along = ahead(delta)
    const across = Math.abs(aside(delta))
    if (along <= 0 || across > along * Math.tan(Math.PI / 3)) continue
    const score = along + across * 2
    if (!best || score < best.score) best = { box, score }
  }
  return best?.box ?? null
}

// The sides an arrow leaves and enters by, so it takes the short way
// between two boxes wherever they are.
export function edgeSides(source: Box, target: Box): { sourceHandle: Side; targetHandle: Side } {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2)
  const dy = target.y + target.height / 2 - (source.y + source.height / 2)
  if (Math.abs(dx) >= Math.abs(dy))
    return dx >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" }
  return dy >= 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" }
}
