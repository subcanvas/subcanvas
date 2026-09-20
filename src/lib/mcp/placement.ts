// Where to put a new node when the caller did not say. Not a layout: what is
// already on the board stays where it is, and a new node takes the nearest
// free spot on a grid, beside the node it relates to when one is named.

export type Box = { x: number; y: number; width: number; height: number }

const GAP = 40
// How far from the starting point to look, in grid steps, before giving up
// and stacking below everything.
const MAX_RINGS = 12

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width + GAP / 2 &&
  b.x < a.x + a.width + GAP / 2 &&
  a.y < b.y + b.height + GAP / 2 &&
  b.y < a.y + a.height + GAP / 2

// The top-left corner for a box of `size`. `taken` is every box already on
// the board (in the same coordinate space) and grows as the caller places
// more. `near` starts the search to the right of that box; without it the
// search starts to the right of everything.
export function findFreeSpot(
  taken: Box[],
  size: { width: number; height: number },
  near?: Box
): { x: number; y: number } {
  if (!taken.length) return { x: 0, y: 0 }

  const right = Math.max(...taken.map((box) => box.x + box.width))
  const top = Math.min(...taken.map((box) => box.y))
  const start = near ? { x: near.x + near.width + GAP, y: near.y } : { x: right + GAP, y: top }
  const stepX = size.width + GAP
  const stepY = size.height + GAP

  // Rings around the start, nearest first; within a ring, prefer staying in
  // the same row, then below, then above.
  for (let ring = 0; ring <= MAX_RINGS; ring++) {
    const candidates: { x: number; y: number; cost: number }[] = []
    for (let column = 0; column <= ring; column++)
      for (const row of ring === 0 ? [0] : [...new Set([ring - column, column - ring])])
        candidates.push({
          x: start.x + column * stepX,
          y: start.y + row * stepY,
          cost: Math.abs(row) * 2 + (row < 0 ? 1 : 0) + column,
        })
    candidates.sort((a, b) => a.cost - b.cost)
    const free = candidates.find((spot) => !taken.some((box) => overlaps({ ...spot, ...size }, box)))
    if (free) return { x: free.x, y: free.y }
  }

  const bottom = Math.max(...taken.map((box) => box.y + box.height))
  return { x: Math.min(...taken.map((box) => box.x)), y: bottom + GAP }
}
