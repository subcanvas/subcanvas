import { describe, expect, it } from "vitest"

import { edgeSides, GAP_ACROSS, GAP_DOWN, nearestBox, placeNext } from "./keyboard-drawing"

const size = { width: 160, height: 64 }
const box = (x: number, y: number, name = "") => ({ name, x, y, ...size })

describe("placeNext", () => {
  it("puts the next box to the right, lined up, or below", () => {
    expect(placeNext(box(0, 0), [], "right", size)).toEqual({ x: 160 + GAP_ACROSS, y: 0 })
    expect(placeNext(box(0, 0), [], "below", size)).toEqual({ x: 0, y: 64 + GAP_DOWN })
  })

  it("centres a box of another size on the one it comes from", () => {
    expect(placeNext({ x: 0, y: 0, width: 160, height: 100 }, [], "right", size).y).toBe(18)
  })

  it("moves on down the column, or along the row, past boxes in the way", () => {
    const across = 160 + GAP_ACROSS
    const down = 64 + GAP_DOWN
    const right = placeNext(box(0, 0), [box(across, 0), box(across, down)], "right", size)
    expect(right).toEqual({ x: across, y: 2 * down })
    const below = placeNext(box(0, 0), [box(0, down)], "below", size)
    expect(below).toEqual({ x: across, y: down })
  })

  it("keeps a box drawn from one on the sheet's grid on it", () => {
    for (const direction of ["right", "below"] as const) {
      const { x, y } = placeNext(box(40, 60), [], direction, size)
      expect([x % 20, y % 20]).toEqual([0, 0])
    }
  })
})

describe("nearestBox", () => {
  const boxes = [box(300, 0, "right"), box(300, 400, "far down right"), box(0, 200, "below"), box(-300, 10, "left")]

  it("finds the box that way", () => {
    expect(nearestBox(box(0, 0), boxes, "right")?.name).toBe("right")
    expect(nearestBox(box(0, 0), boxes, "down")?.name).toBe("below")
    expect(nearestBox(box(0, 0), boxes, "left")?.name).toBe("left")
  })

  it("finds nothing when nothing is that way", () => {
    expect(nearestBox(box(0, 0), boxes, "up")).toBeNull()
  })

  it("prefers a box straight ahead to a nearer one far off to the side", () => {
    expect(nearestBox(box(0, 0), [box(200, 300, "aside"), box(500, 0, "ahead")], "right")?.name).toBe("ahead")
  })
})

it("joins two boxes by the sides that face each other", () => {
  expect(edgeSides(box(0, 0), box(300, 0))).toEqual({ sourceHandle: "right", targetHandle: "left" })
  expect(edgeSides(box(0, 0), box(0, 300))).toEqual({ sourceHandle: "bottom", targetHandle: "top" })
})
