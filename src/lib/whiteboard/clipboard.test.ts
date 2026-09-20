import { describe, expect, it } from "vitest"

import { collectClip, placeClip, type ClipSource } from "./clipboard"
import type { WbEdge, WbNode } from "./schema"

const wbNode = (id: string, x: number, y: number, parentId: string | null = null): WbNode => ({
  id,
  kind: "plain",
  x,
  y,
  width: 160,
  height: 64,
  parentId,
  title: id.toUpperCase(),
  description: "",
  color: "default",
  docId: null,
  docType: null,
  openMode: "panel",
  path: null,
  shape: "rectangle",
  icon: null,
  emoji: null,
})

const source = (wb: WbNode, absolute = { x: wb.x, y: wb.y }): ClipSource => ({
  wb,
  absolute,
  width: 160,
  height: 64,
})

const wbEdge = (source: string, target: string, label = ""): WbEdge => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle: null,
  targetHandle: null,
  shape: "spline",
  stroke: "solid",
  direction: "forward",
  color: "default",
  label,
  docId: null,
  docType: null,
  openMode: "panel",
  icon: null,
  emoji: null,
})

describe("collectClip", () => {
  it("is empty when nothing is selected", () => {
    expect(collectClip([source(wbNode("a", 0, 0))], [], [])).toBeNull()
  })

  it("brings along what is inside a copied group, however deep", () => {
    const sources = [
      source(wbNode("group", 100, 100)),
      source(wbNode("inner", 10, 10, "group"), { x: 110, y: 110 }),
      source(wbNode("leaf", 5, 5, "inner"), { x: 115, y: 115 }),
      source(wbNode("other", 900, 900)),
    ]
    const clip = collectClip(sources, [], ["group"])!
    expect(clip.nodes.map((node) => node.id)).toEqual(["group", "inner", "leaf"])
    // Children keep their place in the group.
    expect(clip.nodes[1]).toMatchObject({ x: 10, y: 10, parentId: "group" })
  })

  it("keeps only the arrows between copied nodes", () => {
    const sources = [source(wbNode("a", 0, 0)), source(wbNode("b", 300, 0)), source(wbNode("c", 600, 0))]
    const clip = collectClip(sources, [wbEdge("a", "b", "calls"), wbEdge("b", "c")], ["a", "b"])!
    expect(clip.edges.map((edge) => edge.id)).toEqual(["a-b"])
    expect(clip.text).toBe("A\nB\nA -> B: calls")
  })

  it("records a copied child's absolute position and the bounds of the whole clip", () => {
    const sources = [
      source(wbNode("group", 100, 100)),
      source(wbNode("child", 20, 30, "group"), { x: 120, y: 130 }),
      source(wbNode("free", 400, 50)),
    ]
    const clip = collectClip(sources, [], ["child", "free"])!
    expect(clip.nodes[0]).toMatchObject({ id: "child", x: 120, y: 130 })
    expect(clip.bounds).toEqual({ x: 120, y: 50, width: 440, height: 144 })
  })
})

describe("placeClip", () => {
  const sources = [
    source(wbNode("group", 100, 100)),
    source(wbNode("child", 20, 30, "group"), { x: 120, y: 130 }),
  ]

  it("moves top-level copies and leaves children where they are in their group", () => {
    const clip = collectClip(sources, [], ["group"])!
    const placed = placeClip(clip, { x: 24, y: 24 }, () => null)
    expect(placed[0]).toMatchObject({ id: "group", x: 124, y: 124, parentId: null })
    expect(placed[1]).toMatchObject({ id: "child", x: 20, y: 30, parentId: "group" })
  })

  it("makes a copy relative to the group it lands in", () => {
    const clip = collectClip(sources, [], ["child"])!
    const placed = placeClip(clip, { x: 24, y: 24 }, () => ({ id: "group", x: 100, y: 100 }))
    expect(placed[0]).toMatchObject({ x: 44, y: 54, parentId: "group" })
  })

  it("drops a parent that is not there", () => {
    const clip = collectClip(sources, [], ["child"])!
    const placed = placeClip(clip, { x: 0, y: 0 }, () => null)
    expect(placed[0]).toMatchObject({ x: 120, y: 130, parentId: null })
  })
})
