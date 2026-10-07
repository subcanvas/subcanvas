import { Notes, type ParseResult } from "./diagram"
import { parseEntityRelationship } from "./er"
import { DIRECTIONS, parseFlowchart } from "./flowchart"
import { parseSequence } from "./sequence"
import { readSource } from "./source"

// Reads Mermaid text into a diagram of boxes, groups and arrows. The kinds
// that are boxes and arrows at heart are drawn: flowcharts, sequence
// diagrams and ER diagrams. The others are refused by name, so whoever
// pasted one knows why.

export const MAX_MERMAID_LENGTH = 100_000

const PARSERS = {
  flowchart: parseFlowchart,
  "flowchart-elk": parseFlowchart,
  graph: parseFlowchart,
  sequenceDiagram: parseSequence,
  erDiagram: parseEntityRelationship,
} as const

// The kinds Mermaid has that are not drawn, by the word they start with.
const OTHERS: Record<string, string> = {
  classDiagram: "a class diagram",
  "classDiagram-v2": "a class diagram",
  stateDiagram: "a state diagram",
  "stateDiagram-v2": "a state diagram",
  gantt: "a Gantt chart",
  pie: "a pie chart",
  journey: "a user journey",
  gitGraph: "a Git graph",
  mindmap: "a mind map",
  timeline: "a timeline",
  quadrantChart: "a quadrant chart",
  requirementDiagram: "a requirement diagram",
  "sankey-beta": "a Sankey diagram",
  sankey: "a Sankey diagram",
  "xychart-beta": "an XY chart",
  xychart: "an XY chart",
  "block-beta": "a block diagram",
  block: "a block diagram",
  "packet-beta": "a packet diagram",
  packet: "a packet diagram",
  "architecture-beta": "an architecture diagram",
  architecture: "an architecture diagram",
  kanban: "a Kanban board",
  radar: "a radar chart",
  "radar-beta": "a radar chart",
  treemap: "a treemap",
  "treemap-beta": "a treemap",
  zenuml: "a ZenUML diagram",
  C4Context: "a C4 diagram",
  C4Container: "a C4 diagram",
  C4Component: "a C4 diagram",
  C4Dynamic: "a C4 diagram",
  C4Deployment: "a C4 diagram",
}

export const SUPPORTED = "flowcharts (`flowchart` or `graph`), sequence diagrams (`sequenceDiagram`) and ER diagrams (`erDiagram`)"

export function parseMermaid(text: string): ParseResult {
  if (text.length > MAX_MERMAID_LENGTH)
    return { ok: false, error: `This is longer than ${MAX_MERMAID_LENGTH / 1000} KB, more than one whiteboard can show.` }
  const notes = new Notes()
  const source = readSource(text, notes)
  if (!source) return { ok: false, error: "There is no Mermaid diagram here." }

  const parse = PARSERS[source.header as keyof typeof PARSERS]
  if (!parse) {
    const other = OTHERS[source.header]
    return {
      ok: false,
      error: other
        ? `This is ${other}. Subcanvas draws ${SUPPORTED}.`
        : `This does not start like a Mermaid diagram Subcanvas can draw. The first line names the kind: ${SUPPORTED}.`,
    }
  }
  const diagram = parse(source, notes)
  if ("error" in diagram) return { ok: false, error: diagram.error }
  return { ok: true, diagram: { ...diagram, notes: notes.list() } }
}

// Whether pasted text is meant as Mermaid: its first line, after any
// fence, front matter, settings and comments, is a Mermaid header and
// nothing else ("flowchart LR", "sequenceDiagram"). Text that only starts
// with the word ("graph theory says...") is not.
export function looksLikeMermaid(text: string) {
  if (!text.trim() || text.length > MAX_MERMAID_LENGTH) return false
  const source = readSource(text, new Notes())
  if (!source || !(source.header in PARSERS || source.header in OTHERS)) return false
  return !source.rest || source.rest.toUpperCase() in DIRECTIONS
}
