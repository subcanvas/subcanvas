import type { EdgeDirection } from "@/lib/whiteboard/schema"
import type { NodeShape } from "@/lib/whiteboard/shapes"

import type { Diagram, DiagramArrow, DiagramBox, DiagramGroup, FlowDirection, Notes } from "./diagram"
import { cleanLabel, cleanTitle, unquote, type Line, type Source } from "./source"

// Mermaid's flowchart (`flowchart` and the older `graph`), the part of its
// grammar people write: nodes in every bracket shape and in the newer
// `A@{ shape: ... }` form, links of every line and head with their labels,
// chains (`A --> B --> C`), `&`, subgraphs to any depth, and links to a
// subgraph. Styling is read past and named in the notes.

export const DIRECTIONS: Record<string, FlowDirection> = { TB: "TB", TD: "TB", BT: "BT", LR: "LR", RL: "RL" }

type Head = "none" | "arrow" | "circle" | "cross"
type Link = { start: Head; end: Head; line: "solid" | "thick" | "dotted" | "hidden"; label: string; length: number }

// The bracket shapes, longest opening first, each with the closings it
// takes and the app's shape nearest to it. Mermaid's round-edged box and its
// stadium both become the pill: the author drew something other than the
// plain rectangle, and the app's rectangle already has softened corners.
const BRACKETS: { open: string; close: string[]; shape: NodeShape; name: string }[] = [
  { open: "(((", close: [")))"], shape: "ellipse", name: "double circle" },
  { open: "((", close: ["))"], shape: "ellipse", name: "circle" },
  { open: "([", close: ["])"], shape: "rounded", name: "stadium" },
  { open: "[[", close: ["]]"], shape: "rectangle", name: "subroutine" },
  { open: "[(", close: [")]"], shape: "cylinder", name: "cylinder" },
  { open: "[/", close: ["/]", "\\]"], shape: "parallelogram", name: "parallelogram" },
  { open: "[\\", close: ["\\]", "/]"], shape: "parallelogram", name: "parallelogram" },
  { open: "[", close: ["]"], shape: "rectangle", name: "rectangle" },
  { open: "(", close: [")"], shape: "rounded", name: "rounded" },
  { open: "{{", close: ["}}"], shape: "hexagon", name: "hexagon" },
  { open: "{", close: ["}"], shape: "diamond", name: "diamond" },
  { open: ">", close: ["]"], shape: "rectangle", name: "asymmetric" },
]

// Shapes drawn as something close but not the same, said once each.
const APPROXIMATE = new Set(["double circle", "subroutine", "asymmetric"])

// The names of Mermaid's newer shapes (`A@{ shape: cyl }`), aliases
// included, for the ones the app has a near match for. Anything else is a
// rectangle, and the notes say so.
const NAMED_SHAPES: Record<string, NodeShape | "text"> = {
  rect: "rectangle", rectangle: "rectangle", proc: "rectangle", process: "rectangle",
  "fr-rect": "rectangle", subproc: "rectangle", subprocess: "rectangle", "framed-rectangle": "rectangle", subroutine: "rectangle",
  rounded: "rounded", event: "rounded", stadium: "rounded", pill: "rounded", terminal: "rounded",
  cyl: "cylinder", cylinder: "cylinder", database: "cylinder", db: "cylinder",
  "h-cyl": "cylinder", das: "cylinder", "horizontal-cylinder": "cylinder", "lin-cyl": "cylinder", disk: "cylinder", "lined-cylinder": "cylinder",
  circle: "ellipse", circ: "ellipse", "dbl-circ": "ellipse", "double-circle": "ellipse", "sm-circ": "ellipse", "small-circle": "ellipse",
  start: "ellipse", "f-circ": "ellipse", "filled-circle": "ellipse", junction: "ellipse", "fr-circ": "ellipse", "framed-circle": "ellipse", stop: "ellipse",
  diam: "diamond", diamond: "diamond", decision: "diamond", question: "diamond",
  hex: "hexagon", hexagon: "hexagon", prepare: "hexagon",
  "lean-r": "parallelogram", "lean-right": "parallelogram", "in-out": "parallelogram",
  "lean-l": "parallelogram", "lean-left": "parallelogram", "out-in": "parallelogram",
  "trap-b": "parallelogram", "trapezoid-bottom": "parallelogram", priority: "parallelogram", trapezoid: "parallelogram",
  "trap-t": "parallelogram", "trapezoid-top": "parallelogram", "inv-trapezoid": "parallelogram", manual: "parallelogram",
  doc: "document", document: "document", "lin-doc": "document", "lined-document": "document",
  docs: "document", documents: "document", "st-doc": "document", "stacked-document": "document",
  "tag-doc": "document", "tagged-document": "document",
  cloud: "cloud",
  text: "text",
}

// Characters that end a node's id.
const NOT_ID = new Set([..." \t[](){}<>|&;\"'`:,@=~"])

class Scanner {
  i = 0
  constructor(readonly s: string) {}
  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++
  }
  get done() {
    return this.i >= this.s.length
  }
  at(text: string) {
    return this.s.startsWith(text, this.i)
  }
  // `pattern` must be sticky (the `y` flag).
  match(pattern: RegExp) {
    pattern.lastIndex = this.i
    const found = pattern.exec(this.s)
    if (found) this.i += found[0].length
    return found
  }
}

type NodeRef = { key: string; title?: string; shape?: NodeShape; kind?: "plain" | "text" }

// Statements are separated by new lines and by `;`, except inside quotes. A
// quoted label may run over several lines.
function statements(lines: Line[]): Line[] {
  const out: Line[] = []
  let pending: Line | null = null
  for (const line of lines) {
    const current: Line = pending ? { number: pending.number, text: `${pending.text}\n${line.text}` } : line
    if ((current.text.match(/"/g)?.length ?? 0) % 2 === 1) {
      pending = current
      continue
    }
    pending = null
    let quoted = false
    let start = 0
    for (let i = 0; i < current.text.length; i++) {
      const char = current.text[i]
      if (char === '"') quoted = !quoted
      else if (char === ";" && !quoted) {
        out.push({ number: current.number, text: current.text.slice(start, i).trim() })
        start = i + 1
      }
    }
    out.push({ number: current.number, text: current.text.slice(start).trim() })
  }
  if (pending) out.push(pending)
  return out.filter((statement) => statement.text)
}

function readId(sc: Scanner) {
  const start = sc.i
  while (!sc.done && !NOT_ID.has(sc.s[sc.i])) {
    // A link starts here, not more of the id.
    if (sc.at("--") || sc.at("-.") || sc.at("==")) break
    sc.i++
  }
  return sc.s.slice(start, sc.i)
}

// The text of a bracket shape: a quoted string, or everything up to the
// first closing bracket.
function readBracket(sc: Scanner, notes: Notes): NodeRef | null {
  for (const bracket of BRACKETS) {
    if (!sc.at(bracket.open)) continue
    const from = sc.i + bracket.open.length
    let textEnd: number
    let after: number
    let close: string | undefined
    const inner = sc.s.slice(from).trimStart()
    if (inner.startsWith('"')) {
      const quoteStart = sc.s.indexOf('"', from)
      const quoteEnd = sc.s.indexOf('"', quoteStart + 1)
      if (quoteEnd === -1) continue
      const rest = sc.s.slice(quoteEnd + 1)
      const gap = rest.length - rest.trimStart().length
      close = bracket.close.find((candidate) => rest.trimStart().startsWith(candidate))
      if (!close) continue
      textEnd = quoteEnd + 1
      after = quoteEnd + 1 + gap + close.length
    } else {
      const found = bracket.close
        .map((candidate) => ({ candidate, at: sc.s.indexOf(candidate, from) }))
        .filter((option) => option.at !== -1)
        .sort((a, b) => a.at - b.at)[0]
      if (!found) continue
      close = found.candidate
      textEnd = found.at
      after = found.at + close.length
    }
    if (APPROXIMATE.has(bracket.name))
      notes.add(`Mermaid's ${bracket.name} shape is drawn as the nearest shape the whiteboard has.`)
    if (bracket.open === "[/" && close === "\\]") notes.add("Trapezoids are drawn as parallelograms.")
    if (bracket.open === "[\\" && close === "/]") notes.add("Trapezoids are drawn as parallelograms.")
    const title = cleanTitle(sc.s.slice(from, textEnd), notes)
    sc.i = after
    return { key: "", title, shape: bracket.shape, kind: "plain" }
  }
  return null
}

// `A@{ shape: cyl, label: "Orders" }`.
function readProperties(sc: Scanner, notes: Notes): NodeRef | null {
  if (!sc.at("@{")) return null
  let depth = 0
  let quoted = false
  let end = -1
  for (let i = sc.i + 1; i < sc.s.length; i++) {
    const char = sc.s[i]
    if (char === '"') quoted = !quoted
    if (quoted) continue
    if (char === "{") depth++
    if (char === "}" && --depth === 0) {
      end = i
      break
    }
  }
  if (end === -1) return null
  const body = sc.s.slice(sc.i + 2, end)
  sc.i = end + 1

  const properties = new Map<string, string>()
  for (const match of body.matchAll(/([\w-]+)\s*:\s*("(?:[^"\\]|\\.)*"|[^,\n}]*)/g))
    properties.set(match[1].toLowerCase(), unquote(match[2].trim()))
  const named = properties.get("shape")?.toLowerCase()
  let shape: NodeShape = "rectangle"
  let kind: "plain" | "text" = "plain"
  if (named) {
    const mapped = NAMED_SHAPES[named]
    if (mapped === "text") kind = "text"
    else if (mapped) shape = mapped
    else notes.add(`Shapes the whiteboard does not have are drawn as rectangles: ${named}.`)
  }
  if (properties.has("icon") || properties.has("img"))
    notes.add("Icon and picture nodes (`icon:`, `img:`) are drawn as boxes with their label.")
  const label = properties.get("label")
  return { key: "", ...(label !== undefined ? { title: cleanTitle(label, notes) } : {}), shape, kind }
}

function readNode(sc: Scanner, notes: Notes): NodeRef | null {
  sc.ws()
  const key = readId(sc)
  if (!key) return null
  const described = readProperties(sc, notes) ?? readBracket(sc, notes)
  if (sc.match(/:::[\w-]+/y)) notes.add("Classes (`:::name`, `class`, `classDef`) are not used: boxes take the whiteboard's own look.")
  return { ...described, key }
}

function readGroupOfNodes(sc: Scanner, notes: Notes): NodeRef[] | null {
  const first = readNode(sc, notes)
  if (!first) return null
  const nodes = [first]
  for (;;) {
    const save = sc.i
    sc.ws()
    if (!sc.match(/&/y)) {
      sc.i = save
      return nodes
    }
    const next = readNode(sc, notes)
    if (!next) return null
    nodes.push(next)
  }
}

const HEADS: Record<string, Head> = { "<": "arrow", ">": "arrow", o: "circle", x: "cross" }

function readLink(sc: Scanner, notes: Notes): Link | null {
  const save = sc.i
  sc.ws()
  // An edge id (`e1@-->`) names the arrow for styling; it is not drawn.
  sc.match(/[\p{L}\p{N}_]+@(?=[<ox]?[-=~.])/uy)
  if (sc.match(/~~~+/y)) return { start: "none", end: "none", line: "hidden", label: "", length: 1 }

  const start = sc.match(/[<ox](?=[-=.])/y)?.[0]
  const body = sc.match(/-{2,}|={2,}|-\.+-?/y)?.[0]
  if (!body) {
    sc.i = save
    return null
  }
  const line = body.startsWith("=") ? "thick" : body.includes(".") ? "dotted" : "solid"
  let end = sc.match(/>|[ox](?![\p{L}\p{N}_])/uy)?.[0]
  let label = ""
  let length: number

  const complete = end !== undefined || (line === "dotted" ? body.endsWith("-") : body.length >= 3)
  if (complete) {
    length = line === "dotted" ? body.length - 2 : body.length - (end ? 1 : 2)
  } else {
    // `-- text -->`, `== text ==>`, `-. text .->`.
    const closing = { solid: /-{2,}[>ox]|-{3,}/g, thick: /={2,}[>ox]|={3,}/g, dotted: /\.+-+[>ox]?/g }[line]
    closing.lastIndex = sc.i
    const found = closing.exec(sc.s)
    if (!found) {
      sc.i = save
      return null
    }
    label = cleanLabel(sc.s.slice(sc.i, found.index), notes)
    sc.i = found.index + found[0].length
    const last = found[0].at(-1)!
    end = last in HEADS ? last : undefined
    length = line === "dotted" ? found[0].replace(/-+[>ox]?$/, "").length : found[0].length - (end ? 1 : 2)
  }

  // `-->|text|`.
  const piped = sc.match(/\s*\|([^|]*)\|/y)
  if (piped) label = cleanLabel(piped[1], notes)

  const startHead = start ? HEADS[start] : "none"
  const endHead = end ? HEADS[end] : "none"
  if (startHead === "circle" || startHead === "cross" || endHead === "circle" || endHead === "cross")
    notes.add("Circle and cross arrowheads (`--o`, `--x`) are drawn as ordinary arrowheads.")
  if (line === "thick") notes.add("Thick links (`==>`) are drawn as ordinary arrows.")
  return { start: startHead, end: endHead, line, label, length: Math.max(1, length) }
}

function direction(link: Link): EdgeDirection {
  const start = link.start !== "none"
  const end = link.end !== "none"
  return start && end ? "both" : end ? "forward" : start ? "reverse" : "none"
}

export function parseFlowchart(source: Source, notes: Notes): Diagram | { error: string } {
  const flow = DIRECTIONS[source.rest.split(/\s+/)[0]?.toUpperCase() ?? ""] ?? "TB"
  const boxes = new Map<string, DiagramBox>()
  const groups = new Map<string, DiagramGroup>()
  const arrows: DiagramArrow[] = []
  const open: string[] = []
  let title = source.title
  let skipping = false

  const mention = (ref: NodeRef) => {
    const inGroup = open.at(-1) ?? null
    const known = boxes.get(ref.key)
    if (!known) {
      boxes.set(ref.key, {
        key: ref.key,
        title: ref.title ?? cleanTitle(ref.key, notes),
        kind: ref.kind ?? "plain",
        shape: ref.shape ?? "rectangle",
        group: inGroup,
      })
      return
    }
    // A later definition says more: Mermaid draws the last one given.
    if (ref.title !== undefined) known.title = ref.title
    if (ref.shape) known.shape = ref.shape
    if (ref.kind) known.kind = ref.kind
    // A box first named outside a subgraph is drawn inside the one that
    // names it next.
    if (!known.group && inGroup) known.group = inGroup
  }

  for (const { number, text } of statements(source.lines)) {
    if (skipping) {
      if (text.includes("}")) skipping = false
      continue
    }

    const subgraph = /^subgraph\b\s*(.*)$/.exec(text)
    if (subgraph) {
      const header = subgraph[1].trim()
      const bracketed = /^([^\s[]+)\s*\[(.*)\]$/.exec(header)
      const key = bracketed ? bracketed[1] : unquote(header) || `subgraph-${groups.size + 1}`
      const groupTitle = cleanTitle(bracketed ? bracketed[2] : header, notes)
      if (!groups.has(key)) groups.set(key, { key, title: groupTitle, parent: open.at(-1) ?? null })
      open.push(key)
      continue
    }
    if (/^end$/.test(text)) {
      if (open.pop() === undefined) notes.unread(number, text)
      continue
    }
    const turned = /^direction\s+(\w+)$/i.exec(text)
    if (turned) {
      if (open.length) notes.add("A direction inside a subgraph is not kept: the whole diagram flows one way.")
      continue
    }
    if (/^(classDef|class|style|linkStyle)\s/.test(text)) {
      notes.add(
        /^linkStyle/.test(text)
          ? "Link styles (`linkStyle`) are not used: arrows take the whiteboard's own look."
          : "Styles and classes (`style`, `classDef`, `class`) are not used: boxes take the whiteboard's own look."
      )
      continue
    }
    if (/^click\s/.test(text)) {
      notes.add("Click actions (`click`) are not kept.")
      continue
    }
    const accessible = /^(accTitle|accDescr|title)\s*(:|\{|\s)\s*(.*)$/.exec(text)
    if (accessible) {
      if (accessible[1] === "title" && !title) title = cleanTitle(accessible[3], notes) || null
      if (accessible[2] === "{" && !accessible[3].includes("}")) skipping = true
      continue
    }

    const sc = new Scanner(text)
    let previous = readGroupOfNodes(sc, notes)
    if (!previous) {
      notes.unread(number, text)
      continue
    }
    const found: { nodes: NodeRef[] }[] = [{ nodes: previous }]
    const links: { from: NodeRef[]; to: NodeRef[]; link: Link }[] = []
    let failed = false
    for (;;) {
      sc.ws()
      if (sc.done) break
      const link = readLink(sc, notes)
      const next = link && readGroupOfNodes(sc, notes)
      if (!link || !next) {
        failed = true
        break
      }
      links.push({ from: previous, to: next, link })
      found.push({ nodes: next })
      previous = next
    }
    if (failed) {
      notes.unread(number, text)
      continue
    }

    for (const { nodes } of found) for (const node of nodes) mention(node)
    for (const { from, to, link } of links)
      for (const source of from)
        for (const target of to) {
          if (link.line === "hidden") notes.add("Invisible links (`~~~`) place boxes but are not drawn.")
          arrows.push({
            source: source.key,
            target: target.key,
            label: link.label,
            direction: direction(link),
            stroke: link.line === "dotted" ? "dotted" : "solid",
            length: link.length,
            ...(link.line === "hidden" ? { hidden: true as const } : {}),
          })
        }
  }
  if (open.length) notes.add("A subgraph was not closed with `end`; it was closed at the end of the diagram.")

  // A subgraph named in a link is the group, not a box of the same name.
  for (const key of groups.keys()) boxes.delete(key)

  const drawn = arrows.filter((arrow) => {
    if (arrow.source !== arrow.target) return true
    notes.add(`An arrow from a box to itself cannot be drawn: ${arrow.source}.`)
    return false
  })

  if (!boxes.size && !groups.size) return { error: "This flowchart has no nodes to draw." }
  return {
    kind: "flowchart",
    title,
    direction: flow,
    boxes: [...boxes.values()],
    groups: [...groups.values()],
    arrows: drawn,
    notes: [],
  }
}
