import { MAX_LABEL } from "@/lib/whiteboard/limits"

import type { Diagram, DiagramArrow, DiagramBox, DiagramGroup, Notes } from "./diagram"
import { cleanLabel, cleanText, cleanTitle, unquote, type Source } from "./source"

// Mermaid's sequence diagram, drawn the way a whiteboard can: each
// participant is a box, in a row in the order they first appear, and the
// messages between two of them are one labelled arrow, numbered so the
// order of the conversation still reads. A `box` around participants is a
// group. What only a timeline can show (activations, notes, loops and
// alternatives) is named in the notes; the messages inside a loop or an
// alternative are kept.

const ARROWS = ["<<-->>", "<<->>", "-->>", "->>", "--x", "-x", "--)", "-)", "-->", "->"]
const MESSAGE = new RegExp(
  `^(.+?)\\s*(${ARROWS.map((arrow) => arrow.replace(/[()]/g, "\\$&")).join("|")})\\s*[+-]?\\s*([^:]+?)\\s*(?::(.*))?$`
)
const BLOCKS = /^(loop|alt|else|opt|par|par_over|and|critical|option|break|rect)\b/

// The types of the newer `participant A@{ "type": "database" }` form.
const PARTICIPANT_SHAPES: Record<string, DiagramBox["shape"]> = {
  database: "cylinder",
  collections: "document",
  queue: "cylinder",
}

type Message = { order: number; source: string; target: string; text: string; dotted: boolean; heads: "none" | "forward" | "both" }

export function parseSequence(source: Source, notes: Notes): Diagram | { error: string } {
  const participants = new Map<string, DiagramBox>()
  const groups: DiagramGroup[] = []
  const messages: Message[] = []
  // What each `end` closes: a box of participants, or a block of messages.
  const open: ({ kind: "box"; key: string } | { kind: "block" })[] = []
  let title = source.title

  const participant = (name: string, fields: Partial<DiagramBox> = {}) => {
    const key = unquote(name.trim())
    const known = participants.get(key)
    const box = open.findLast((entry) => entry.kind === "box")
    if (known) {
      Object.assign(known, fields)
      return known
    }
    const created: DiagramBox = {
      key,
      title: cleanTitle(key, notes),
      kind: "plain",
      shape: "rectangle",
      group: box?.kind === "box" ? box.key : null,
      ...fields,
    }
    participants.set(key, created)
    return created
  }

  for (const { number, text } of source.lines) {
    const declared = /^(?:create\s+)?(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(text)
    if (declared) {
      const [, role, declaredName, alias] = declared
      let name = declaredName
      const fields: Partial<DiagramBox> = role === "actor" ? { icon: "user" } : {}
      const properties = /^(.+?)@\{(.*)\}$/.exec(name)
      if (properties) {
        name = properties[1]
        const type = /"?type"?\s*:\s*"?([\w-]+)"?/.exec(properties[2])?.[1]?.toLowerCase()
        if (type === "actor") fields.icon = "user"
        else if (type && PARTICIPANT_SHAPES[type]) fields.shape = PARTICIPANT_SHAPES[type]
        else if (type) notes.add(`Participant types the whiteboard has no shape for are drawn as rectangles: ${type}.`)
      }
      if (alias) fields.title = cleanTitle(alias, notes)
      participant(name, fields)
      continue
    }

    const box = /^box\b\s*(.*)$/.exec(text)
    if (box) {
      // `box Aqua Payments`, `box rgb(33,66,99) Payments`, `box Payments`.
      const words = box[1].replace(/^(rgba?\([^)]*\)|transparent|[a-z]+(?=\s))\s*/i, (color) => {
        if (color.trim()) notes.add("The colors of boxes around participants are not kept.")
        return ""
      })
      const key = `box-${groups.length + 1}`
      groups.push({ key, title: cleanTitle(words || "Participants", notes), parent: null })
      open.push({ kind: "box", key })
      continue
    }
    if (BLOCKS.test(text)) {
      const word = BLOCKS.exec(text)![1]
      if (word === "rect") notes.add("Highlighted stretches (`rect`) are not drawn.")
      else
        notes.add("Loops, alternatives and other blocks (`loop`, `alt`, `opt`, `par`, `critical`, `break`) are not drawn; the messages inside them are.")
      if (!["else", "and", "option"].includes(word)) open.push({ kind: "block" })
      continue
    }
    if (/^end$/.test(text)) {
      if (!open.pop()) notes.unread(number, text)
      continue
    }
    if (/^note\b/i.test(text)) {
      notes.add("Notes (`Note over`, `Note left of`) are not drawn.")
      continue
    }
    if (/^(activate|deactivate)\s/.test(text)) {
      notes.add("Activations are not drawn.")
      continue
    }
    if (/^destroy\s/.test(text)) {
      notes.add("Destroying a participant (`destroy`) is not drawn; its box stays.")
      continue
    }
    if (/^autonumber\b/.test(text)) continue
    if (/^(links?|properties|details)\s/.test(text)) {
      notes.add("Participant menus (`link`, `links`) are not kept.")
      continue
    }
    const named = /^(title|accTitle|accDescr)\s*:?\s*(.*)$/.exec(text)
    if (named) {
      if (named[1] === "title" && !title) title = cleanTitle(named[2], notes) || null
      continue
    }

    const message = MESSAGE.exec(text)
    if (message) {
      const [, from, arrow, to, words = ""] = message
      const source = participant(from).key
      const target = participant(to).key
      if (source === target) {
        notes.add("A message from a participant to itself cannot be drawn as an arrow, and was left out.")
        continue
      }
      messages.push({
        order: messages.length + 1,
        source,
        target,
        text: cleanText(unquote(words.trim()), MAX_LABEL, notes),
        dotted: arrow.includes("--"),
        heads: arrow.startsWith("<<") ? "both" : arrow.endsWith(">") && !arrow.endsWith(">>") ? "none" : "forward",
      })
      continue
    }
    notes.unread(number, text)
  }

  if (!participants.size) return { error: "This sequence diagram has no participants to draw." }

  // One arrow for each direction between two participants, carrying every
  // message sent that way, in order.
  const pairs = new Map<string, Message[]>()
  for (const message of messages) {
    const key = `${message.source}\u0000${message.target}`
    pairs.set(key, [...(pairs.get(key) ?? []), message])
  }
  const arrows: DiagramArrow[] = [...pairs.values()].map((sent) => {
    const words = sent.map((message) => (message.text ? `${message.order}. ${message.text}` : `${message.order}.`)).join(", ")
    return {
      source: sent[0].source,
      target: sent[0].target,
      label: cleanLabel(words, notes),
      direction: sent.some((message) => message.heads === "both")
        ? "both"
        : sent.some((message) => message.heads === "forward")
          ? "forward"
          : "none",
      stroke: sent.every((message) => message.dotted) ? "dotted" : "solid",
      length: 1,
    }
  })
  if (pairs.size < messages.length)
    notes.add("Messages sent the same way between two participants share one arrow, numbered in the order they were sent.")

  return {
    kind: "sequence",
    title,
    direction: "LR",
    boxes: [...participants.values()],
    groups: groups.filter((group) => [...participants.values()].some((box) => box.group === group.key)),
    arrows,
    notes: [],
  }
}
