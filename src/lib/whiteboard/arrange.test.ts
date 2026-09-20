import { describe, expect, it } from "vitest"

import { arrange, type ArrangeEdge, type ArrangeNode, type Box } from "./arrange"

const node = (id: string, x: number, y: number, extra: Partial<ArrangeNode> = {}): ArrangeNode => ({
  id,
  x,
  y,
  width: 160,
  height: 64,
  parentId: null,
  ...extra,
})

const edge = (source: string, target: string, label = ""): ArrangeEdge => ({
  id: `${source}-${target}`,
  source,
  target,
  label,
  sourceHandle: "bottom",
  targetHandle: "top",
})

// The board as it is after the arrangement has been written.
function apply(nodes: ArrangeNode[], edges: ArrangeEdge[], selected: string[]) {
  const result = arrange(nodes, edges, selected)
  return {
    result,
    nodes: nodes.map((before) => ({ ...before, ...result.nodes.get(before.id) })),
    edges: edges.map((before) => ({ ...before, ...result.edges.get(before.id) })),
  }
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

function expectNoOverlap(boxes: (Box & { id: string })[]) {
  for (const a of boxes)
    for (const b of boxes)
      if (a.id < b.id) expect(overlaps(a, b), `${a.id} overlaps ${b.id}`).toBe(false)
}

// Where the canvas draws an arrow's label: halfway between the two handles.
function labelBox(edge: ArrangeEdge, nodes: ArrangeNode[]): Box {
  const handle = (id: string, side: string | null) => {
    const box = nodes.find((candidate) => candidate.id === id)!
    return {
      x: box.x + (side === "left" ? 0 : side === "right" ? box.width : box.width / 2),
      y: box.y + (side === "top" ? 0 : side === "bottom" ? box.height : box.height / 2),
    }
  }
  const from = handle(edge.source, edge.sourceHandle)
  const to = handle(edge.target, edge.targetHandle)
  const width = edge.label.length * 6.6 + 14
  return { x: (from.x + to.x) / 2 - width / 2, y: (from.y + to.y) / 2 - 10, width, height: 20 }
}

describe("arrange", () => {
  it("separates nodes that were piled on top of each other", () => {
    const pile = ["a", "b", "c", "d", "e"].map((id, index) => node(id, 100 + index * 5, 100 + index * 5))
    const { nodes } = apply(pile, [], ["a", "b", "c", "d", "e"])
    expectNoOverlap(nodes)
  })

  it("keeps the selection's top-left corner where it was", () => {
    const board = [node("a", 340, 520), node("b", 300, 560), node("c", 420, 500)]
    const { nodes } = apply(board, [edge("a", "b"), edge("b", "c")], ["a", "b", "c"])
    expect(Math.min(...nodes.map((n) => n.x))).toBe(300)
    expect(Math.min(...nodes.map((n) => n.y))).toBe(500)
  })

  it("leaves what is not selected alone", () => {
    const board = [node("a", 0, 0), node("b", 10, 10), node("bystander", 20, 20)]
    const { result } = apply(board, [], ["a", "b"])
    expect(result.nodes.has("bystander")).toBe(false)
  })

  it("does nothing for a single node", () => {
    const { result } = apply([node("a", 5, 5), node("b", 9, 9)], [edge("a", "b")], ["a"])
    expect(result.nodes.size).toBe(0)
    expect(result.edges.size).toBe(0)
  })

  it("follows the arrows, left to right, and turns them to face each other", () => {
    const board = [node("c", 0, 0), node("b", 0, 10), node("a", 0, 20)]
    const { nodes, edges } = apply(board, [edge("a", "b"), edge("b", "c")], ["a", "b", "c"])
    const x = (id: string) => nodes.find((n) => n.id === id)!.x
    expect(x("a")).toBeLessThan(x("b"))
    expect(x("b")).toBeLessThan(x("c"))
    for (const arranged of edges)
      expect([arranged.sourceHandle, arranged.targetHandle]).toEqual(["right", "left"])
  })

  it("keeps arrow labels clear of the nodes", () => {
    const board = ["a", "b", "c", "d", "e"].map((id, index) => node(id, index * 12, index * 9))
    const arrows = [
      edge("a", "b", "sends the order to"),
      edge("b", "c", "charges"),
      // Skips a column, so it passes the nodes in between.
      edge("a", "d", "notifies when it is done"),
      edge("c", "d", "confirms"),
      edge("a", "e", "logs"),
    ]
    const { nodes, edges } = apply(board, arrows, ["a", "b", "c", "d", "e"])
    expectNoOverlap(nodes)
    for (const arrow of edges)
      for (const box of nodes)
        expect(overlaps(labelBox(arrow, nodes), box), `${arrow.id} label under ${box.id}`).toBe(false)
  })

  it("arranges a group's children inside it and grows the group to hold them", () => {
    const board = [
      node("group", 1000, 1000, { width: 360, height: 240 }),
      node("one", 40, 50, { parentId: "group" }),
      node("two", 50, 60, { parentId: "group" }),
      node("three", 60, 70, { parentId: "group" }),
    ]
    const { nodes } = apply(board, [edge("one", "two"), edge("two", "three")], ["one", "two", "three"])
    const group = nodes.find((n) => n.id === "group")!
    const children = nodes.filter((n) => n.parentId === "group")

    expectNoOverlap(children)
    expect([group.x, group.y]).toEqual([1000, 1000])
    expect(Math.min(...children.map((child) => child.x))).toBe(40)
    expect(Math.min(...children.map((child) => child.y))).toBe(50)
    for (const child of children) {
      expect(child.x + child.width).toBeLessThanOrEqual(group.width)
      expect(child.y + child.height).toBeLessThanOrEqual(group.height)
    }
    expect(group.width).toBeGreaterThan(360)
  })

  it("places a group by its grown size, and treats an arrow into it as an arrow to it", () => {
    const board = [
      node("outside", 0, 0),
      node("group", 20, 20, { width: 200, height: 120 }),
      node("one", 20, 30, { parentId: "group" }),
      node("two", 30, 40, { parentId: "group" }),
    ]
    const { nodes } = apply(board, [edge("outside", "two")], ["outside", "group", "one", "two"])
    const top = nodes.filter((n) => n.parentId === null)
    expectNoOverlap(top)
    expect(top.find((n) => n.id === "outside")!.x).toBeLessThan(top.find((n) => n.id === "group")!.x)
  })

  it("keeps small nodes together when a large group is among them", () => {
    const board = [
      node("group", 0, 0, { width: 360, height: 240 }),
      ...["a", "b", "c", "d"].map((id, index) => node(id, 10 * index, 10 * index)),
    ]
    const { nodes } = apply(board, [], ["group", "a", "b", "c", "d"])
    expectNoOverlap(nodes)
    // Not one cell of the group's size for each of them.
    expect(Math.max(...nodes.map((n) => n.x + n.width))).toBeLessThan(800)
  })

  it("puts nodes without arrows under the ones that have them", () => {
    const board = [node("a", 50, 50), node("b", 60, 60), node("loose", 55, 55)]
    const { nodes } = apply(board, [edge("a", "b")], ["a", "b", "loose"])
    expectNoOverlap(nodes)
    const y = (id: string) => nodes.find((n) => n.id === id)!.y
    expect(y("loose")).toBeGreaterThan(y("a"))
    expect(Math.min(...nodes.map((n) => n.y))).toBe(50)
  })

  it("does not resize a node that only moved", () => {
    const { result } = apply([node("a", 0, 0), node("b", 1, 1)], [], ["a", "b"])
    for (const change of result.nodes.values()) expect(change.width).toBeUndefined()
  })
})
