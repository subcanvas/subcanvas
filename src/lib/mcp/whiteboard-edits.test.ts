import { describe, expect, it } from "vitest"
import * as Y from "yjs"

import { edgesMap, nodesMap, readEdge, readNode } from "@/lib/whiteboard/schema"

import * as edits from "./whiteboard-edits"

const nodeOf = (doc: Y.Doc, id: string) => readNode(id, nodesMap(doc).get(id)!)
const ids = <T extends object>(result: T | { error: string }) => {
  if ("error" in result) throw new Error(result.error)
  return result
}

describe("whiteboard edits", () => {
  it("writes a node with the fields and sizes the canvas writes", () => {
    const doc = new Y.Doc()
    const [box, heading] = ids(edits.addNodes(doc, [{ kind: "plain", title: "API" }, { kind: "text", title: "Heading" }])).ids
    expect(nodesMap(doc).get(box)!.toJSON()).toEqual({
      kind: "plain", x: 0, y: 0, width: 160, height: 64, title: "API", description: "", color: "default",
    })
    expect(nodeOf(doc, heading)).toMatchObject({ width: 240, height: null })
  })

  it("places a batch without overlaps, beside the node it is near", () => {
    const doc = new Y.Doc()
    const [first] = ids(edits.addNodes(doc, [{ kind: "plain", title: "first", x: 100, y: 100 }])).ids
    const added = ids(edits.addNodes(doc, Array.from({ length: 5 }, () => ({ kind: "plain" as const, title: "n", nearNodeId: first })))).ids
    expect(nodeOf(doc, added[0])).toMatchObject({ x: 300, y: 100 })
    const spots = new Set([first, ...added].map((id) => `${nodeOf(doc, id).x},${nodeOf(doc, id).y}`))
    expect(spots.size).toBe(6)
  })

  it("changes nothing when any id is unknown", () => {
    const doc = new Y.Doc()
    const [a] = ids(edits.addNodes(doc, [{ kind: "plain", title: "a" }])).ids
    const before = Y.encodeStateAsUpdate(doc)
    expect(edits.updateNodes(doc, [{ id: a, title: "changed" }, { id: "missing", title: "x" }])).toHaveProperty("error")
    expect(edits.connectNodes(doc, [{ source: a, target: "missing" }])).toHaveProperty("error")
    expect(edits.connectNodes(doc, [{ source: a, target: a }])).toHaveProperty("error")
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)
  })

  it("connects by the nearest sides and removes a node's arrows with it", () => {
    const doc = new Y.Doc()
    const [a, b] = ids(edits.addNodes(doc, [{ kind: "plain", title: "a", x: 0, y: 0 }, { kind: "plain", title: "b", x: 0, y: 400 }])).ids
    const [edge] = ids(edits.connectNodes(doc, [{ source: a, target: b, label: "calls" }])).ids
    expect(readEdge(edge, edgesMap(doc).get(edge)!)).toMatchObject({
      sourceHandle: "bottom", targetHandle: "top", direction: "forward", shape: "spline", stroke: "solid", label: "calls",
    })
    expect(ids(edits.deleteNodes(doc, [b]))).toEqual({ nodes: [b], edges: [edge] })
    expect(edgesMap(doc).size).toBe(0)
  })

  it("draws a group around nodes and keeps them where they were", () => {
    const doc = new Y.Doc()
    const [a, b] = ids(edits.addNodes(doc, [{ kind: "plain", title: "a", x: 100, y: 100 }, { kind: "plain", title: "b", x: 400, y: 100 }])).ids
    const group = ids(edits.createGroup(doc, { title: "Both", nodeIds: [a, b] })).id
    const frame = nodeOf(doc, group)
    expect(nodeOf(doc, a)).toMatchObject({ parentId: group, x: 100 - frame.x, y: 100 - frame.y })

    ids(edits.setGroup(doc, [a], null))
    expect(nodeOf(doc, a)).toMatchObject({ parentId: null, x: 100, y: 100 })
    expect(edits.setGroup(doc, [group], group)).toHaveProperty("error")

    ids(edits.deleteNodes(doc, [group]))
    expect([...nodesMap(doc).keys()]).toEqual([a])
  })

  it("lays out along the arrows", () => {
    const doc = new Y.Doc()
    const [a, b, c] = ids(edits.addNodes(doc, ["a", "b", "c"].map((title) => ({ kind: "plain" as const, title, x: 0, y: 0 })))).ids
    ids(edits.connectNodes(doc, [{ source: a, target: b }, { source: b, target: c }]))
    ids(edits.arrangeNodes(doc, null))
    expect(nodeOf(doc, a).x).toBeLessThan(nodeOf(doc, b).x)
    expect(nodeOf(doc, b).x).toBeLessThan(nodeOf(doc, c).x)
  })
})
