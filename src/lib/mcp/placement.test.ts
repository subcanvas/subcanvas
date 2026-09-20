import { describe, expect, it } from "vitest"

import { findFreeSpot, type Box } from "./placement"

const size = { width: 160, height: 64 }
const touches = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe("findFreeSpot", () => {
  it("starts an empty board at the origin", () => {
    expect(findFreeSpot([], size)).toEqual({ x: 0, y: 0 })
  })

  it("goes to the right of the node it is near", () => {
    const near = { x: 100, y: 100, ...size }
    expect(findFreeSpot([near], size, near)).toEqual({ x: 300, y: 100 })
  })

  it("moves on when the spot beside the node is taken", () => {
    const near = { x: 0, y: 0, ...size }
    const blocker = { x: 200, y: 0, ...size }
    const spot = findFreeSpot([near, blocker], size, near)
    expect(touches({ ...spot, ...size }, blocker)).toBe(false)
    expect(touches({ ...spot, ...size }, near)).toBe(false)
  })

  it("never puts two nodes of one batch on top of each other", () => {
    const taken: Box[] = [{ x: 0, y: 0, ...size }]
    for (let i = 0; i < 40; i++) {
      const spot = { ...findFreeSpot(taken, size, taken[0]), ...size }
      expect(taken.some((box) => touches(spot, box))).toBe(false)
      taken.push(spot)
    }
  })
})
