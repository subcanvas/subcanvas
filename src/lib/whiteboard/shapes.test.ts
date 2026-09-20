import { describe, expect, it } from "vitest"

import { NODE_SHAPES, SHAPE_SIZE, linesThatFit, shapeGeometry } from "./shapes"

const SIZES = [
  { x: 0, y: 0, width: 160, height: 64 },
  { x: -300, y: 120, width: 400, height: 90 },
  { x: 10, y: 10, width: 80, height: 40 },
  { x: 0, y: 0, width: 60, height: 300 },
  { x: 0, y: 0, width: 1, height: 1 },
]

describe("shapeGeometry", () => {
  it("draws every shape with finite numbers, at any size", () => {
    for (const shape of NODE_SHAPES)
      for (const box of SIZES) {
        const { outline, detail } = shapeGeometry(shape, box)
        expect(outline, shape).toMatch(/^M[-\d. ]+[A-Za-z][-\dA-Za-z. ]*Z$/)
        expect(`${outline}${detail ?? ""}`, shape).not.toMatch(/NaN|Infinity|undefined/)
      }
  })

  it("keeps the anchors, the text and the badge within the node's box", () => {
    for (const shape of NODE_SHAPES)
      for (const box of SIZES.slice(0, 4)) {
        const { anchors, text, badge } = shapeGeometry(shape, box)
        const within = (point: { x: number; y: number }) =>
          point.x >= box.x - 0.01 &&
          point.x <= box.x + box.width + 0.01 &&
          point.y >= box.y - 0.01 &&
          point.y <= box.y + box.height + 0.01
        for (const point of [...Object.values(anchors), badge]) expect(within(point), shape).toBe(true)
        expect(within(text) && within({ x: text.x + text.width, y: text.y + text.height }), shape).toBe(true)
        // Each anchor is on its own side of the middle.
        expect(anchors.top.y).toBeLessThan(anchors.bottom.y)
        expect(anchors.left.x).toBeLessThan(anchors.right.x)
      }
  })

  it("attaches edges to the outline, not to the box, where the two differ", () => {
    const box = { x: 0, y: 0, width: 200, height: 100 }
    expect(shapeGeometry("rectangle", box).anchors.left).toEqual({ x: 0, y: 50 })
    expect(shapeGeometry("diamond", box).anchors.top).toEqual({ x: 100, y: 0 })
    // Half the lean in from each side.
    const leaning = shapeGeometry("parallelogram", box).anchors
    expect(leaning.left).toEqual({ x: 20, y: 50 })
    expect(leaning.right).toEqual({ x: 180, y: 50 })
    // The wave crosses its middle line under the middle of the node.
    expect(shapeGeometry("document", box).anchors.bottom.y).toBeCloseTo(89.5)
    const cloud = shapeGeometry("cloud", box).anchors
    expect(cloud.left.x).toBeGreaterThan(10)
    expect(cloud.right.x).toBeLessThan(190)
    expect(cloud.bottom).toEqual({ x: 100, y: 100 })
  })

  it("leaves room for a two-line title at the size each shape comes in", () => {
    for (const shape of NODE_SHAPES) {
      const { text } = shapeGeometry(shape, { x: 0, y: 0, ...SHAPE_SIZE[shape] })
      expect(linesThatFit(text.height, 17.875, 3), shape).toBeGreaterThanOrEqual(2)
      expect(text.width, shape).toBeGreaterThanOrEqual(80)
    }
  })
})

describe("linesThatFit", () => {
  it("is never less than one line or more than the most allowed", () => {
    expect(linesThatFit(0, 18, 3)).toBe(1)
    expect(linesThatFit(40, 18, 3)).toBe(2)
    expect(linesThatFit(400, 18, 3)).toBe(3)
  })
})
