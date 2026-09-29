import { describe, expect, it } from "vitest"
import * as Y from "yjs"

import { edgesMap, newMediaNode, nodesMap, readEdge, readNode, toYMap } from "@/lib/whiteboard/schema"

import { whiteboardTools } from "./tools/whiteboard"
import * as edits from "./whiteboard-edits"

const MEDIA_PATH = `${crypto.randomUUID()}/${crypto.randomUUID()}/${crypto.randomUUID()}/${crypto.randomUUID()}.png`

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

  it("gives a box a shape at that shape's size, and badges, and takes a badge off with null", () => {
    const doc = new Y.Doc()
    const [database, heading] = ids(
      edits.addNodes(doc, [
        { kind: "plain", title: "Orders", shape: "cylinder", icon: "database", emoji: "🐘", x: 0, y: 0 },
        { kind: "text", title: "Heading" },
      ])
    ).ids
    expect(nodeOf(doc, database)).toMatchObject({ shape: "cylinder", icon: "database", emoji: "🐘", width: 144, height: 100 })

    // Still at the size its shape came in, so it takes the new shape's size
    // around the same center, as the canvas does.
    edits.updateNodes(doc, [{ id: database, shape: "hexagon", emoji: null }])
    expect(nodeOf(doc, database)).toMatchObject({ shape: "hexagon", icon: "database", emoji: null, width: 184, height: 72, x: -20, y: 14 })
    // Sized by hand, it keeps its size.
    edits.updateNodes(doc, [{ id: database, width: 300 }])
    edits.updateNodes(doc, [{ id: database, shape: "diamond" }])
    expect(nodeOf(doc, database)).toMatchObject({ shape: "diamond", width: 300, height: 72 })

    const [arrow] = ids(edits.connectNodes(doc, [{ source: database, target: heading, icon: "lock", label: "TLS" }])).ids
    expect(readEdge(arrow, edgesMap(doc).get(arrow)!)).toMatchObject({ icon: "lock", emoji: null, label: "TLS" })
  })

  it("refuses what a node of its kind cannot show, and writes nothing", () => {
    const doc = new Y.Doc()
    const [box, heading] = ids(edits.addNodes(doc, [{ kind: "plain", title: "API" }, { kind: "text", title: "Heading", description: "Body" }])).ids
    expect(nodeOf(doc, heading).description).toBe("Body")
    const picture = crypto.randomUUID()
    nodesMap(doc).set(
      picture,
      toYMap(newMediaNode({ id: picture, x: 0, y: 0, width: 160, height: 90, mediaWidth: 1600, mediaHeight: 900, mediaPath: MEDIA_PATH }))
    )
    const before = Y.encodeStateAsUpdate(doc)

    expect(edits.addNodes(doc, [{ kind: "plain", title: "API", description: "Next.js" }])).toEqual({
      error: '"API" is a box, and only a text node shows body text (`description`). To give it a description, put a page inside it with `attach_document`.',
    })
    expect(edits.addNodes(doc, [{ kind: "group", title: "Frame", shape: "diamond" }])).toHaveProperty("error")
    expect(edits.updateNodes(doc, [{ id: heading, title: "ok" }, { id: box, description: "Next.js" }])).toHaveProperty("error")
    expect(edits.updateNodes(doc, [{ id: heading, shape: "cloud" }])).toHaveProperty("error")
    expect(edits.updateNodes(doc, [{ id: box, alt: "A box" }])).toHaveProperty("error")
    expect(edits.updateNodes(doc, [{ id: picture, color: "red" }])).toHaveProperty("error")
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)
  })

  it("keeps sizes to what the canvas lets a person resize to", () => {
    const doc = new Y.Doc()
    const [box, heading, group] = ids(
      edits.addNodes(doc, [
        { kind: "plain", title: "tiny", width: 10, height: 10 },
        { kind: "text", title: "Heading", width: 50 },
        { kind: "group", title: "Huge", width: 99_999, height: 20 },
      ])
    ).ids
    expect(nodeOf(doc, box)).toMatchObject({ width: 80, height: 40 })
    expect(nodeOf(doc, heading)).toMatchObject({ width: 120, height: null })
    expect(nodeOf(doc, group)).toMatchObject({ width: 4000, height: 100 })

    edits.updateNodes(doc, [{ id: heading, width: 300, height: 500 }])
    expect(nodeOf(doc, heading)).toMatchObject({ width: 300, height: null })

    // A picture keeps its file's proportions, whichever side is given.
    const picture = crypto.randomUUID()
    nodesMap(doc).set(
      picture,
      toYMap(newMediaNode({ id: picture, x: 0, y: 0, width: 160, height: 90, mediaWidth: 1600, mediaHeight: 900, mediaPath: MEDIA_PATH }))
    )
    edits.updateNodes(doc, [{ id: picture, width: 320, height: 10 }])
    expect(nodeOf(doc, picture)).toMatchObject({ width: 320, height: 180 })
    edits.updateNodes(doc, [{ id: picture, height: 45 }])
    expect(nodeOf(doc, picture)).toMatchObject({ width: 80, height: 48 })
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

  it("takes from an agent the words a person could type, and stores an emoji as the app does", () => {
    const tool = (name: string) => whiteboardTools.find((candidate) => candidate.name === name)!.input
    const whiteboard_id = crypto.randomUUID()
    const parsed = tool("add_nodes").parse({ whiteboard_id, nodes: [{ title: "a".repeat(200), emoji: " 🐘 " }] })
    expect(parsed).toMatchObject({ nodes: [{ emoji: "🐘" }] })
    expect(() => tool("add_nodes").parse({ whiteboard_id, nodes: [{ title: "a".repeat(201) }] })).toThrow()
    expect(() => tool("add_nodes").parse({ whiteboard_id, nodes: [{ kind: "text", title: "t", description: "a".repeat(2001) }] })).toThrow()
    expect(() => tool("connect_nodes").parse({ whiteboard_id, edges: [{ source: "a", target: "b", label: "a".repeat(121) }] })).toThrow()
    expect(() => tool("update_nodes").parse({ whiteboard_id, nodes: [{ id: "a", alt: "a".repeat(501) }] })).toThrow()
  })
})
