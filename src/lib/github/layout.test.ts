import { describe, expect, it } from "vitest"

import { edgeSides, layoutBoard, nodeWidth, type LayoutEdge, type LayoutNode } from "./layout"

const GAP = 16

function overlaps(nodes: LayoutNode[], positions: ReturnType<typeof layoutBoard>) {
  const boxes = nodes.map((node) => ({ ...node, ...positions.get(node.id)! }))
  const found: string[] = []
  for (const a of boxes)
    for (const b of boxes)
      if (
        a.id < b.id &&
        a.x < b.x + b.width + GAP &&
        b.x < a.x + a.width + GAP &&
        a.y < b.y + b.height + GAP &&
        b.y < a.y + a.height + GAP
      )
        found.push(`${a.id} and ${b.id}`)
  return found
}

const node = (id: string, width = 200): LayoutNode => ({ id, width, height: 64 })
const edge = (source: string, target: string, label = ""): LayoutEdge => ({ source, target, label })

// A small deterministic generator, so a failure can be reproduced.
function random(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
}

describe("layoutBoard", () => {
  it("lays a board with no arrows out as a grid", () => {
    const nodes = Array.from({ length: 11 }, (_, i) => node(`n${i}`))
    const positions = layoutBoard(nodes, [])
    expect(overlaps(nodes, positions)).toEqual([])
    expect(positions.get("n0")).toEqual({ x: 0, y: 0 })
    expect(new Set([...positions.values()].map((position) => position.y)).size).toBe(3)
  })

  it("runs left to right along the arrows", () => {
    const nodes = ["web", "payments", "ledger"].map((id) => node(id))
    const positions = layoutBoard(nodes, [edge("web", "payments", "REST"), edge("payments", "ledger", "gRPC")])
    expect(positions.get("web")!.x).toBeLessThan(positions.get("payments")!.x)
    expect(positions.get("payments")!.x).toBeLessThan(positions.get("ledger")!.x)
    expect(overlaps(nodes, positions)).toEqual([])
  })

  it("leaves room between columns for a long label", () => {
    const nodes = [node("a"), node("b")]
    const label = "a fairly long label on an arrow"
    const positions = layoutBoard(nodes, [edge("a", "b", label)])
    expect(positions.get("b")!.x - (positions.get("a")!.x + 200)).toBeGreaterThan(label.length * 6)
  })

  it("puts loose nodes under the flow, not over it", () => {
    const nodes = ["a", "b", "c", "loose1", "loose2", "loose3", "loose4"].map((id) => node(id))
    const positions = layoutBoard(nodes, [edge("a", "b"), edge("a", "c")])
    expect(overlaps(nodes, positions)).toEqual([])
    const flowBottom = Math.max(...["a", "b", "c"].map((id) => positions.get(id)!.y + 64))
    expect(positions.get("loose1")!.y).toBeGreaterThan(flowBottom)
  })

  it("survives cycles, arrows both ways, self arrows, and arrows to nowhere", () => {
    const nodes = ["a", "b", "c"].map((id) => node(id))
    const positions = layoutBoard(nodes, [
      edge("a", "b"), edge("b", "a"), edge("b", "c"), edge("c", "a"), edge("a", "a"), edge("a", "ghost"),
    ])
    expect(positions.size).toBe(3)
    expect(overlaps(nodes, positions)).toEqual([])
  })

  it("never overlaps nodes, whatever the shape of the graph", () => {
    const next = random(7)
    for (let round = 0; round < 60; round++) {
      const count = 1 + Math.floor(next() * 60)
      const nodes = Array.from({ length: count }, (_, i) => node(`n${i}`, 160 + Math.floor(next() * 100)))
      const edges = Array.from({ length: Math.floor(next() * count * 1.5) }, () =>
        edge(`n${Math.floor(next() * count)}`, `n${Math.floor(next() * count)}`, "x".repeat(Math.floor(next() * 20)))
      )
      const positions = layoutBoard(nodes, edges)
      expect(positions.size).toBe(count)
      expect(overlaps(nodes, positions)).toEqual([])
      for (const { x, y } of positions.values()) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
        expect(x).toBeGreaterThanOrEqual(0)
        expect(y).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it("keeps an arrow that skips a column clear of the node it skips", () => {
    // a -> b -> c, and a -> c: the long arrow is drawn straight from a to c.
    const nodes = [node("a"), node("b"), node("c")]
    const positions = layoutBoard(nodes, [edge("a", "b"), edge("b", "c"), edge("a", "c", "long way round")])
    const [a, b, c] = ["a", "b", "c"].map((id) => positions.get(id)!)
    const lineTop = Math.min(a.y, c.y) + 32
    const lineBottom = Math.max(a.y, c.y) + 32
    expect(b.y + 64 < lineTop || b.y > lineBottom).toBe(true)
  })

  it("handles an empty board", () => {
    expect(layoutBoard([], []).size).toBe(0)
  })
})

describe("edgeSides", () => {
  const box = (x: number, y: number) => ({ x, y, width: 200, height: 64 })
  it("takes the short way", () => {
    expect(edgeSides(box(0, 0), box(400, 20))).toEqual({ sourceHandle: "right", targetHandle: "left" })
    expect(edgeSides(box(400, 0), box(0, 20))).toEqual({ sourceHandle: "left", targetHandle: "right" })
    expect(edgeSides(box(0, 0), box(40, 300))).toEqual({ sourceHandle: "bottom", targetHandle: "top" })
    expect(edgeSides(box(0, 300), box(40, 0))).toEqual({ sourceHandle: "top", targetHandle: "bottom" })
  })
})

describe("nodeWidth", () => {
  it("fits the longer of the title and the path, within limits", () => {
    expect(nodeWidth("UI", "ui")).toBe(160)
    expect(nodeWidth("Payments", "services/payments/internal")).toBeGreaterThan(160)
    expect(nodeWidth("x".repeat(200), null)).toBe(260)
  })
})
