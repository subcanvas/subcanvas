import type { EdgeDirection, EdgeStroke } from "@/lib/whiteboard/schema"
import type { NodeShape } from "@/lib/whiteboard/shapes"

// What a Mermaid diagram says, read into the words of a whiteboard: boxes,
// groups and arrows. The parsers (flowchart.ts, sequence.ts, er.ts) make
// one; draw.ts gives it places and turns it into whiteboard objects. Nothing
// here knows about the canvas, the database or the DOM, so the same code
// runs in the browser, on the server and in tests.

export type DiagramKind = "flowchart" | "sequence" | "er"

// Where the arrows flow: top to bottom, bottom to top, left to right, right
// to left. Mermaid's TD is TB.
export type FlowDirection = "TB" | "BT" | "LR" | "RL"

export type DiagramBox = {
  // The Mermaid id. Unique among boxes and groups.
  key: string
  title: string
  // A text node has no outline (Mermaid's `text` shape); everything else is
  // a box with one of the app's shapes.
  kind: "plain" | "text"
  shape: NodeShape
  // The group (Mermaid subgraph, or sequence box) the box is in.
  group: string | null
  icon?: string
  // A page that belongs to the box: an ER entity's attributes. Markdown.
  page?: { title: string; markdown: string }
}

export type DiagramGroup = {
  key: string
  title: string
  // The group this one is inside.
  parent: string | null
}

export type DiagramArrow = {
  // A box's or a group's key.
  source: string
  target: string
  label: string
  direction: EdgeDirection
  stroke: EdgeStroke
  // Mermaid's longer links (`--->`) ask for more room between the two ends.
  length: number
  // An invisible link (`~~~`) only places boxes; it is not drawn.
  hidden?: true
}

export type Diagram = {
  kind: DiagramKind
  // From front matter or a `title` line. Becomes the whiteboard's name.
  title: string | null
  direction: FlowDirection
  boxes: DiagramBox[]
  groups: DiagramGroup[]
  arrows: DiagramArrow[]
  // What the diagram said that the whiteboard does not show, in words for
  // the person or agent who wrote it. Never silently dropped.
  notes: string[]
}

export type ParseResult = { ok: true; diagram: Diagram } | { ok: false; error: string }

// Collects notes, saying each kind of thing once however often it occurs.
export class Notes {
  private order: string[] = []

  add(note: string) {
    if (!this.order.includes(note)) this.order.push(note)
  }

  // A line that could not be read, quoted so it can be found and fixed.
  unread(line: number, text: string) {
    const quoted = text.length > 60 ? `${text.slice(0, 57)}...` : text
    this.order.push(`Line ${line} could not be read and was left out: \`${quoted}\``)
  }

  list() {
    return [...this.order]
  }
}
