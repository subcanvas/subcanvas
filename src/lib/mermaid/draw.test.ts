import { describe, expect, it } from "vitest"

import type { WbNode } from "@/lib/whiteboard/schema"

import type { Diagram } from "./diagram"
import { boxSize, drawDiagram, drawDiagramBeside } from "./draw"
import { parseMermaid } from "./parse"

function diagramOf(text: string): Diagram {
  const result = parseMermaid(text)
  if (!result.ok) throw new Error(result.error)
  return result.diagram
}

let counter = 0
const newId = () => `id-${++counter}`

// Where a node is on the board, whatever group it is in.
function absolute(node: WbNode, nodes: WbNode[]): { x: number; y: number; width: number; height: number } {
  const parent = node.parentId ? nodes.find((other) => other.id === node.parentId)! : null
  const origin = parent ? absolute(parent, nodes) : { x: 0, y: 0 }
  return { x: origin.x + node.x, y: origin.y + node.y, width: node.width ?? 0, height: node.height ?? 0 }
}

const overlap = (a: ReturnType<typeof absolute>, b: ReturnType<typeof absolute>) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe("drawing a diagram", () => {
  const ARCHITECTURE = `flowchart LR
    subgraph Backend
      API[API gateway] --> Orders[Order service]
      subgraph Storage
        DB[(Orders DB)]
      end
    end
    Web[Web app] -->|HTTPS| API
    Orders -->|writes| DB
    Orders --> Mail{{Mail}}`

  it("makes boxes, groups and arrows the canvas can show, with nothing on top of anything", () => {
    const drawn = drawDiagram(diagramOf(ARCHITECTURE), { newId })
    const byTitle = Object.fromEntries(drawn.nodes.map((node) => [node.title, node]))
    expect(drawn.nodes.map((node) => node.kind)).toEqual(["group", "group", "plain", "plain", "plain", "plain", "plain"])
    expect(byTitle["Orders DB"].shape).toBe("cylinder")
    expect(byTitle.Mail.shape).toBe("hexagon")

    // Groups nest, outer first, and each holds its boxes.
    expect(byTitle.Storage.parentId).toBe(byTitle.Backend.id)
    expect(byTitle["Orders DB"].parentId).toBe(byTitle.Storage.id)
    expect(byTitle["Web app"].parentId).toBeNull()
    const boxes = drawn.nodes.filter((node) => node.kind === "plain")
    for (const box of boxes) {
      if (!box.parentId) continue
      const group = absolute(drawn.nodes.find((node) => node.id === box.parentId)!, drawn.nodes)
      const inside = absolute(box, drawn.nodes)
      expect(inside.x).toBeGreaterThanOrEqual(group.x)
      expect(inside.y).toBeGreaterThanOrEqual(group.y)
      expect(inside.x + inside.width).toBeLessThanOrEqual(group.x + group.width)
      expect(inside.y + inside.height).toBeLessThanOrEqual(group.y + group.height)
    }
    for (const [index, box] of boxes.entries())
      for (const other of boxes.slice(index + 1))
        expect(overlap(absolute(box, drawn.nodes), absolute(other, drawn.nodes))).toBe(false)

    // Left to right, along the arrows, which leave and enter by the sides
    // that face each other.
    const at = (title: string) => absolute(byTitle[title], drawn.nodes)
    expect(at("Web app").x).toBeLessThan(at("API gateway").x)
    expect(at("Order service").x).toBeLessThan(at("Orders DB").x)
    const https = drawn.edges.find((edge) => edge.label === "HTTPS")!
    expect(https).toMatchObject({ source: byTitle["Web app"].id, target: byTitle["API gateway"].id, sourceHandle: "right", targetHandle: "left", direction: "forward" })
    expect(drawn.keys.get("API")).toBe(byTitle["API gateway"].id)
  })

  it("flows the way the diagram says", () => {
    const flow = (direction: string) => {
      const drawn = drawDiagram(diagramOf(`flowchart ${direction}\n  A --> B`), { newId })
      const [a, b] = drawn.nodes
      return { dx: b.x - a.x, dy: b.y - a.y, sides: [drawn.edges[0].sourceHandle, drawn.edges[0].targetHandle] }
    }
    expect(flow("LR")).toMatchObject({ dy: 0, sides: ["right", "left"] })
    expect(flow("LR").dx).toBeGreaterThan(0)
    expect(flow("RL").dx).toBeLessThan(0)
    expect(flow("TB")).toMatchObject({ dx: 0, sides: ["bottom", "top"] })
    expect(flow("TB").dy).toBeGreaterThan(0)
    expect(flow("BT").dy).toBeLessThan(0)
  })

  it("keeps the labels of arrows that fan out apart in a diagram that flows down", () => {
    const drawn = drawDiagram(
      diagramOf(`erDiagram
        CUSTOMER ||--o{ ORDER : places
        CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`),
      { newId }
    )
    const middle = (edgeLabel: string) => {
      const edge = drawn.edges.find((candidate) => candidate.label.startsWith(edgeLabel))!
      const ends = [edge.source, edge.target].map((id) => drawn.nodes.find((node) => node.id === id)!)
      return (ends[0].x + ends[0].width! / 2 + ends[1].x + ends[1].width! / 2) / 2
    }
    const apart = Math.abs(middle("places") - middle("uses"))
    expect(apart).toBeGreaterThan("uses (1..* to 1..*)".length * 6.5)
  })

  it("puts an ER entity's attributes on the page inside its box", () => {
    const drawn = drawDiagram(diagramOf("erDiagram\n  A {\n    int id PK\n  }\n  A ||--o{ B : has"), { newId })
    const a = drawn.nodes.find((node) => node.title === "A")!
    expect(drawn.pages).toEqual([{ nodeId: a.id, title: "A", markdown: expect.stringContaining("| id | int | PK |") }])
  })

  it("stands a sequence diagram's participants in a row, with arrows that go round what they pass", () => {
    const drawn = drawDiagram(
      diagramOf(`sequenceDiagram
        participant A
        participant B
        participant C
        A->>B: one
        B-->>A: two
        A->>C: three`),
      { newId }
    )
    const [a, b, c] = drawn.nodes
    expect(new Set([a.y, b.y, c.y]).size).toBe(1)
    expect(a.x + a.width!).toBeLessThan(b.x)
    expect(b.x + b.width!).toBeLessThan(c.x)
    const sides = Object.fromEntries(drawn.edges.map((edge) => [edge.label, [edge.sourceHandle, edge.targetHandle, edge.shape]]))
    expect(sides).toEqual({
      "1. one": ["right", "left", "spline"],
      "2. two": ["bottom", "bottom", "step"],
      "3. three": ["top", "top", "step"],
    })
    expect(drawn.edges.find((edge) => edge.label === "2. two")?.stroke).toBe("dotted")
  })

  it("leaves invisible links out of the drawing but not out of the layout", () => {
    const drawn = drawDiagram(diagramOf("flowchart LR\n  A ~~~ B"), { newId })
    expect(drawn.edges).toEqual([])
    expect(drawn.nodes[1].x).toBeGreaterThan(drawn.nodes[0].x)
  })

  it("draws a diagram added to a whiteboard to the right of what is there", () => {
    const taken = [{ x: 0, y: 0, width: 400, height: 300 }]
    const drawn = drawDiagramBeside(diagramOf("flowchart TB\n  A --> B"), taken, { newId })
    for (const node of drawn.nodes) expect(node.x).toBeGreaterThanOrEqual(440)
  })
})

describe("sizing a box for its title", () => {
  it("keeps a shape's own size for a short title", () => {
    expect(boxSize("rectangle", "API")).toEqual({ width: 160, height: 64 })
    expect(boxSize("diamond", "OK?")).toEqual({ width: 184, height: 112 })
  })

  it("grows wider for a long title, then taller, within reason", () => {
    const long = boxSize("rectangle", "A service that does rather a lot of different things")
    expect(long.width).toBeGreaterThan(160)
    expect(long.width).toBeLessThanOrEqual(280)
    const huge = boxSize("diamond", "x".repeat(200))
    expect(huge.width).toBeLessThanOrEqual(320)
    expect(huge.height).toBeLessThan(400)
  })
})
