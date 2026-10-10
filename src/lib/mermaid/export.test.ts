import { describe, expect, it } from "vitest"

import type { Diagram } from "./diagram"
import { drawDiagram } from "./draw"
import { whiteboardMermaid } from "./export"
import { parseMermaid } from "./parse"

function diagramOf(text: string): Diagram {
  const result = parseMermaid(text)
  if (!result.ok) throw new Error(result.error)
  return result.diagram
}

let counter = 0
const newId = () => `id-${++counter}`

// What a diagram says, without the keys each side makes up.
function meaning(diagram: Diagram) {
  const titleOf = new Map([...diagram.boxes, ...diagram.groups].map((item) => [item.key, item.title]))
  return {
    boxes: diagram.boxes.map((box) => `${box.title} ${box.shape} in ${box.group ? titleOf.get(box.group) : "-"}`).sort(),
    groups: diagram.groups.map((group) => `${group.title} in ${group.parent ? titleOf.get(group.parent) : "-"}`).sort(),
    arrows: diagram.arrows
      .map((arrow) => `${titleOf.get(arrow.source)} ${arrow.stroke} ${arrow.direction} "${arrow.label}" ${titleOf.get(arrow.target)}`)
      .sort(),
  }
}

describe("a whiteboard as Mermaid", () => {
  const ARCHITECTURE = `flowchart LR
    subgraph Backend
      API{{API gateway}} --> Orders[Order service]
      subgraph Storage
        DB[(Orders DB)]
      end
    end
    Web([Web app]) -->|"HTTPS #quot;v2#quot;"| API
    Orders -.->|order.placed| Mail((Mail))
    Orders --- DB
    Web <--> Audit[/Audit log/]`

  it("reads back as the same boxes, shapes, groups and arrows", () => {
    const original = diagramOf(ARCHITECTURE)
    const drawn = drawDiagram(original, { newId })
    const text = whiteboardMermaid({ nodes: drawn.nodes, edges: drawn.edges }, "Shop")
    const again = diagramOf(text)
    expect(meaning(again)).toEqual(meaning(original))
    expect(again.title).toBe("Shop")
  })

  it("writes Mermaid that any renderer reads, with the whiteboard's colors as classes", () => {
    const drawn = drawDiagram(diagramOf("flowchart TB\n  A[Ledger] --> B[Payments]"), { newId })
    const [ledger, payments] = drawn.nodes
    const text = whiteboardMermaid(
      { nodes: [{ ...ledger, color: "green" }, { ...payments, color: "green", docType: "whiteboard", docId: "x" }], edges: drawn.edges },
      'Money "flows"'
    )
    expect(text).toBe(
      [
        "---",
        'title: "Money \\"flows\\""',
        "---",
        "flowchart TB",
        '  %% "Payments" opens into a whiteboard of its own, not drawn here.',
        '  n1["Ledger"]',
        '  n2["Payments"]',
        "  n1 --> n2",
        "  classDef green fill:#ecf6f1,stroke:#2b9a66",
        "  class n1,n2 green",
        "",
      ].join("\n")
    )
  })

  it("writes an arrow that points back the other way round", () => {
    const drawn = drawDiagram(diagramOf("flowchart LR\n  A --> B"), { newId })
    const text = whiteboardMermaid({ nodes: drawn.nodes, edges: drawn.edges.map((edge) => ({ ...edge, direction: "reverse" })) }, "T")
    expect(text).toContain("  n2 --> n1")
  })
})
