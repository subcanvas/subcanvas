import type { Diagram, DiagramArrow, DiagramBox, Notes } from "./diagram"
import { DIRECTIONS } from "./flowchart"
import { cleanLabel, cleanTitle, unquote, type Source } from "./source"

// Mermaid's entity relationship diagram. Each entity is a box. A box shows
// only its title, so an entity's attributes are a table on the page inside
// it, one click away, which is where the whiteboard keeps the detail of a
// box. Each relationship is an arrow from the first entity to the second,
// labelled with its words and its cardinality ("places (1 to 0..*)"),
// dotted when Mermaid draws it dashed (a non-identifying relationship).

const LEFT: Record<string, string> = { "|o": "0..1", "||": "1", "}o": "0..*", "}|": "1..*" }
const RIGHT: Record<string, string> = { "o|": "0..1", "||": "1", "o{": "0..*", "|{": "1..*" }

// Mermaid also takes words for each end.
const WORDS: Record<string, string> = {
  "zero or one": "0..1", "one or zero": "0..1",
  "exactly one": "1", "only one": "1", "1": "1",
  "zero or more": "0..*", "zero or many": "0..*", "many(0)": "0..*", "0+": "0..*",
  "one or more": "1..*", "one or many": "1..*", "many(1)": "1..*", "1+": "1..*",
}

const NAME = String.raw`("[^"]+"|[\p{L}\p{N}_-]+)`
const SYMBOLS = new RegExp(
  `^${NAME}\\s*(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s*${NAME}\\s*:\\s*(.*)$`,
  "u"
)
const WORDED = new RegExp(
  `^${NAME}\\s+(${Object.keys(WORDS).map((word) => word.replace(/[()+]/g, "\\$&")).join("|")})\\s+(to|optionally to)\\s+(${Object.keys(WORDS).map((word) => word.replace(/[()+]/g, "\\$&")).join("|")})\\s+${NAME}\\s*:\\s*(.*)$`,
  "u"
)
const ENTITY = new RegExp(`^${NAME}\\s*(?:\\[\\s*("[^"]*"|[^\\]]*)\\s*\\])?\\s*(\\{\\s*(\\}?))?$`, "u")
const ATTRIBUTE = /^([\w\-[\]().,]+?(?:\(\s*[\d\s,]+\))?)\s+([\w\-*[\]]+)((?:\s+(?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?)(?:\s+"([^"]*)")?$/

type Attribute = { type: string; name: string; keys: string; comment: string }

const cell = (text: string) => text.replace(/\|/g, "\\|").trim()

// The attributes as a Markdown table, the page inside an entity's box.
function attributesPage(attributes: Attribute[]) {
  const keys = attributes.some((attribute) => attribute.keys)
  const comments = attributes.some((attribute) => attribute.comment)
  const header = ["Attribute", "Type", ...(keys ? ["Key"] : []), ...(comments ? ["Comment"] : [])]
  const rows = attributes.map((attribute) => [
    attribute.name,
    attribute.type,
    ...(keys ? [attribute.keys] : []),
    ...(comments ? [attribute.comment] : []),
  ])
  return [header, header.map(() => "---"), ...rows].map((row) => `| ${row.map(cell).join(" | ")} |`).join("\n")
}

export function parseEntityRelationship(source: Source, notes: Notes): Diagram | { error: string } {
  const entities = new Map<string, DiagramBox & { attributes: Attribute[] }>()
  const arrows: DiagramArrow[] = []
  let direction = DIRECTIONS[source.rest.toUpperCase()] ?? "TB"
  let title = source.title
  // The entity whose attributes are being read, between `{` and `}`.
  let inside: (DiagramBox & { attributes: Attribute[] }) | null = null

  const entity = (name: string, label?: string) => {
    const key = unquote(name)
    const known = entities.get(key)
    if (known) {
      if (label) known.title = cleanTitle(label, notes)
      return known
    }
    const created = { key, title: cleanTitle(label ?? key, notes), kind: "plain" as const, shape: "rectangle" as const, group: null, attributes: [] }
    entities.set(key, created)
    return created
  }

  for (const { number, text } of source.lines) {
    if (inside) {
      if (text === "}") {
        inside = null
        continue
      }
      const attribute = ATTRIBUTE.exec(text)
      if (attribute)
        inside.attributes.push({
          type: attribute[1],
          name: attribute[2],
          keys: attribute[3].replace(/\s+/g, " ").trim(),
          comment: attribute[4] ?? "",
        })
      else notes.unread(number, text)
      continue
    }

    const turned = /^direction\s+(\w+)$/i.exec(text)
    if (turned) {
      direction = DIRECTIONS[turned[1].toUpperCase()] ?? direction
      continue
    }
    const named = /^(title|accTitle|accDescr)\s*:?\s*(.*)$/.exec(text)
    if (named) {
      if (named[1] === "title" && !title) title = cleanTitle(named[2], notes) || null
      continue
    }
    if (/^(classDef|class|style)\s/.test(text)) {
      notes.add("Styles and classes (`style`, `classDef`, `class`) are not used: boxes take the whiteboard's own look.")
      continue
    }

    const symbols = SYMBOLS.exec(text)
    const worded = symbols ? null : WORDED.exec(text)
    if (symbols || worded) {
      const [from, left, line, right, to, words] = symbols
        ? [symbols[1], LEFT[symbols[2]], symbols[3] === ".." ? "dotted" : "solid", RIGHT[symbols[4]], symbols[5], symbols[6]]
        : [worded![1], WORDS[worded![2]], worded![3] === "to" ? "solid" : "dotted", WORDS[worded![4]], worded![5], worded![6]]
      const source = entity(from).key
      const target = entity(to).key
      if (source === target) {
        notes.add(`A relationship of an entity with itself cannot be drawn as an arrow: ${source}.`)
        continue
      }
      const label = cleanLabel(words, notes)
      arrows.push({
        source,
        target,
        label: cleanLabel(label ? `${label} (${left} to ${right})` : `${left} to ${right}`, notes),
        direction: "forward",
        stroke: line === "dotted" ? "dotted" : "solid",
        length: 1,
      })
      continue
    }

    const declared = ENTITY.exec(text)
    if (declared) {
      const box = entity(declared[1], declared[2])
      // `NAME {` opens its attributes, unless it is `NAME { }`.
      if (declared[3] && !declared[4]) inside = box
      continue
    }
    notes.unread(number, text)
  }
  if (inside) notes.add("An entity's attributes were not closed with `}`; they were closed at the end of the diagram.")

  if (!entities.size) return { error: "This ER diagram has no entities to draw." }
  const boxes: DiagramBox[] = [...entities.values()].map(({ attributes, ...box }) =>
    attributes.length ? { ...box, page: { title: box.title, markdown: attributesPage(attributes) } } : box
  )
  return { kind: "er", title, direction, boxes, groups: [], arrows, notes: [] }
}
