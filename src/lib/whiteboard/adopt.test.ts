import { describe, expect, it } from "vitest"

import { adoptions, type Placed } from "./adopt"

const at = (id: string, x: number, y: number, width: number, height: number, parentId: string | null = null): Placed => ({
  id,
  parentId,
  x,
  y,
  width,
  height,
})

const group = at("g", 100, 100, 400, 300)

describe("adoptions", () => {
  it("takes in what lies wholly inside, with positions relative to the group", () => {
    const inside = at("in", 150, 180, 160, 64)
    const straddling = at("half", 450, 180, 160, 64)
    const outside = at("out", 900, 900, 160, 64)
    expect(adoptions("g", [group, inside, straddling, outside])).toEqual([{ id: "in", parentId: "g", x: 50, y: 80 }])
  })

  it("leaves alone what is already inside it, at any depth", () => {
    const child = at("child", 150, 150, 200, 150, "g")
    const grandchild = at("grandchild", 160, 160, 50, 50, "child")
    expect(adoptions("g", [group, child, grandchild])).toEqual([])
  })

  it("takes a smaller group whole, and not its children from under it", () => {
    const small = at("small", 150, 150, 200, 150)
    const child = at("child", 160, 160, 50, 50, "small")
    expect(adoptions("g", [group, small, child]).map((adoption) => adoption.id)).toEqual(["small"])
  })

  it("takes a node over from a larger group it was dropped inside of", () => {
    const outer = at("outer", 0, 0, 1000, 1000)
    const inner = { ...group, parentId: "outer" }
    const node = at("node", 150, 150, 50, 50, "outer")
    expect(adoptions("g", [outer, inner, node])).toEqual([{ id: "node", parentId: "g", x: 50, y: 50 }])
  })

  it("never closes a loop", () => {
    // A parent that has ended up inside its own child's box.
    const parent = at("parent", 150, 150, 50, 50)
    const inner = { ...group, parentId: "parent" }
    expect(adoptions("g", [parent, inner])).toEqual([])
  })

  it("does nothing for a group that is not there", () => {
    expect(adoptions("gone", [group])).toEqual([])
  })
})
