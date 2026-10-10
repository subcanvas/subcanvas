import type { NodeShape } from "@/lib/whiteboard/shapes"
import { COLORS } from "@/lib/whiteboard/colors"
import type { ColorKey, WbEdge, WbNode } from "@/lib/whiteboard/schema"

// A whiteboard as a Mermaid flowchart, for anywhere Mermaid is read: a
// GitHub README or issue renders it, and any chat with an AI can read it
// (docs/EXPORTING.md). Boxes keep their names, shapes and colors, groups
// become subgraphs, and arrows keep their labels, their dotted lines and
// which way they point. Only Mermaid's classic syntax is written, which
// every renderer reads. The import (parse.ts) reads it back to the same
// boxes, shapes and arrows.
//
// What Mermaid has no words for is said in comments at the top: headings
// (text nodes), and the whiteboards boxes open into, which are diagrams of
// their own.

const BRACKETS: Record<NodeShape, [string, string]> = {
  rectangle: ["[", "]"],
  rounded: ["([", "])"],
  ellipse: ["((", "))"],
  diamond: ["{", "}"],
  hexagon: ["{{", "}}"],
  cylinder: ["[(", ")]"],
  parallelogram: ["[/", "/]"],
  // No classic bracket draws these; they are the nearest that do.
  document: ["[", "]"],
  cloud: ["(", ")"],
}

// Text in a Mermaid label: quoted, with what would end the quote or the
// line written as Mermaid's entities.
const label = (text: string) =>
  `"${text.trim().replace(/"/g, "#quot;").replace(/\s*\n\s*/g, "<br>") || " "}"`

const comment = (text: string) => text.replace(/\s+/g, " ").trim()

// A light fill of a pencil color, as the canvas draws it (colors.ts):
// nine parts in a hundred of the stroke over white.
function fillOf(hex: string) {
  const channel = (at: number) => parseInt(hex.slice(at, at + 2), 16)
  const mix = (value: number) => Math.round(255 + (value - 255) * 0.09).toString(16).padStart(2, "0")
  return `#${mix(channel(1))}${mix(channel(3))}${mix(channel(5))}`
}

export function whiteboardMermaid(contents: { nodes: WbNode[]; edges: WbEdge[] }, title: string) {
  // Top to bottom, then left to right, so the text reads the way the
  // whiteboard does.
  const byPlace = (a: WbNode, b: WbNode) => a.y - b.y || a.x - b.x
  const nodes = contents.nodes.filter((node) => node.kind !== "text").sort(byPlace)
  const headings = contents.nodes.filter((node) => node.kind === "text").sort(byPlace)
  const keys = new Map(nodes.map((node, index) => [node.id, `${node.kind === "group" ? "g" : "n"}${index + 1}`]))

  // The way most arrows run: across when the boxes spread wider than tall.
  const boxes = nodes.filter((node) => node.kind !== "group")
  const spread = (axis: "x" | "y") =>
    boxes.length ? Math.max(...boxes.map((node) => node[axis])) - Math.min(...boxes.map((node) => node[axis])) : 0
  const direction = spread("x") >= spread("y") ? "LR" : "TB"

  const lines: string[] = []
  // Front matter is YAML, where a JSON string is a string.
  lines.push("---", `title: ${JSON.stringify(comment(title) || "Untitled")}`, "---", `flowchart ${direction}`)
  for (const heading of headings)
    lines.push(`  %% ${comment([heading.title, heading.description].filter(Boolean).join(": "))}`)
  for (const node of nodes)
    if (node.docType === "whiteboard")
      lines.push(`  %% "${comment(node.title)}" opens into a whiteboard of its own, not drawn here.`)

  const childrenOf = (parent: string | null) =>
    nodes.filter((node) => (node.parentId && keys.has(node.parentId) ? node.parentId : null) === parent)
  const write = (parent: string | null, indent: string) => {
    for (const node of childrenOf(parent)) {
      const key = keys.get(node.id)!
      if (node.kind === "group") {
        lines.push(`${indent}subgraph ${key} [${label(node.title)}]`)
        write(node.id, `${indent}  `)
        lines.push(`${indent}end`)
        continue
      }
      const name = node.kind === "media" ? node.title || node.alt || "Picture" : node.title || "Untitled"
      const [open, close] = BRACKETS[node.kind === "plain" ? node.shape : "rectangle"]
      lines.push(`${indent}${key}${open}${label(name)}${close}`)
    }
  }
  write(null, "  ")

  for (const edge of contents.edges) {
    const from = keys.get(edge.source)
    const to = keys.get(edge.target)
    if (!from || !to) continue
    // Mermaid has no arrow that points back, so one is written the other way.
    const [start, end] = edge.direction === "reverse" ? [to, from] : [from, to]
    const dotted = edge.stroke === "dotted"
    const link =
      edge.direction === "none"
        ? dotted ? "-.-" : "---"
        : edge.direction === "both"
          ? dotted ? "<-.->" : "<-->"
          : dotted ? "-.->" : "-->"
    lines.push(`  ${start} ${link}${edge.label.trim() ? `|${label(edge.label)}|` : ""} ${end}`)
  }

  // A class for each pencil color used, after the boxes it colors.
  const colored = new Map<ColorKey, string[]>()
  for (const node of nodes)
    if (node.color !== "default") colored.set(node.color, [...(colored.get(node.color) ?? []), keys.get(node.id)!])
  for (const [color, members] of colored) {
    const stroke = COLORS[color].stroke
    lines.push(`  classDef ${color} fill:${fillOf(stroke)},stroke:${stroke}`)
    lines.push(`  class ${members.join(",")} ${color}`)
  }

  return `${lines.join("\n")}\n`
}
