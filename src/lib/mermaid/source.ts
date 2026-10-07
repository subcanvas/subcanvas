import { MAX_LABEL, MAX_TITLE } from "@/lib/whiteboard/limits"

import type { Notes } from "./diagram"

// What every kind of diagram shares before its own grammar starts: the text
// as people paste it (in a Markdown fence, with front matter, comments and
// directives), and the words inside labels (quotes, HTML, entity codes).

export type Line = { number: number; text: string }

export type Source = {
  // The first word of the diagram: `flowchart`, `graph`, `sequenceDiagram`...
  header: string
  // The rest of the header line: a flowchart's direction.
  rest: string
  // The lines after the header, trimmed, without comments and blank lines.
  lines: Line[]
  title: string | null
}

const FENCE = /^\s*(`{3,}|~{3,})\s*mermaid\b[^\n]*\n([\s\S]*?)\n\s*\1/m

// Mermaid text as people paste it: on its own, or in a ```mermaid fence
// copied out of a README or a chat. Front matter gives a title; directives
// and comments go.
export function readSource(text: string, notes: Notes): Source | null {
  let body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
  const fenced = FENCE.exec(body)
  if (fenced) body = fenced[2]

  let title: string | null = null
  const front = /^\s*---\n([\s\S]*?)\n---\s*(\n|$)/.exec(body)
  if (front) {
    body = body.slice(front[0].length)
    const named = /^title:\s*(.+)$/m.exec(front[1])
    if (named) title = cleanText(unquote(named[1].trim()), MAX_TITLE) || null
    if (/^(config|theme|look|layout|displayMode):/m.test(front[1]))
      notes.add("The front matter's settings (theme, look, layout) are not used.")
  }

  // `%%{init: ...}%%` may run over several lines.
  body = body.replace(/%%\{[\s\S]*?\}%%/g, () => {
    notes.add("Mermaid settings (`%%{init}%%`) are not used.")
    return ""
  })

  const lines: Line[] = []
  body.split("\n").forEach((raw, index) => {
    const text = raw.trim()
    if (text && !text.startsWith("%%")) lines.push({ number: index + 1, text })
  })
  const first = lines.shift()
  if (!first) return null
  // `graph LR; A --> B` is a whole diagram on one line.
  const [head, ...more] = first.text.split(";")
  const after = more.join(";").trim()
  if (after) lines.unshift({ number: first.number, text: after })
  const [header, ...rest] = head.trim().split(/\s+/)
  return { header, rest: rest.join(" ").trim(), lines, title }
}

export const unquote = (text: string) =>
  text.length >= 2 && /^(["'`])[\s\S]*\1$/.test(text) ? text.slice(1, -1) : text

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026",
  larr: "\u2190", rarr: "\u2192", uarr: "\u2191", darr: "\u2193", harr: "\u2194", times: "\u00d7", middot: "\u00b7", bull: "\u2022", copy: "\u00a9",
}

function entity(name: string) {
  if (name.startsWith("#x") || name.startsWith("#X")) return safeCodePoint(parseInt(name.slice(2), 16))
  if (name.startsWith("#")) return safeCodePoint(parseInt(name.slice(1), 10))
  return NAMED_ENTITIES[name.toLowerCase()] ?? null
}

function safeCodePoint(code: number) {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : null
}

// A label as the whiteboard shows it: one line of plain words. Mermaid's
// line breaks become spaces (a box wraps its title itself), Markdown strings
// and HTML lose their markup, entity codes (`#quot;`, `&amp;`) become their
// characters, and Font Awesome icons (`fa:fa-car`) are left out.
export function cleanText(text: string, max: number, notes?: Notes) {
  let clean = text
  // A Markdown string: "`**bold** and _italic_`".
  if (/^`[\s\S]*`$/.test(clean)) clean = clean.slice(1, -1).replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2")
  clean = clean
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\\n/g, " ")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/fa[bsrl]?:fa-[\w-]+/g, () => {
      notes?.add("Font Awesome icons (`fa:fa-...`) are left out of labels.")
      return ""
    })
    // Mermaid's own codes (`#35;`, `#quot;`) and HTML's (`&#35;`, `&quot;`).
    .replace(/[#&](#?x?[\da-f]+|[a-z]+);/gi, (whole, name: string) => {
      const decoded = whole.startsWith("#") ? entity(/^\d+$/.test(name) ? `#${name}` : name) : entity(name)
      return decoded ?? whole
    })
    .replace(/\s+/g, " ")
    .trim()
  if (clean.length > max) {
    notes?.add(`Labels longer than ${max} characters were shortened.`)
    clean = `${clean.slice(0, max - 1).trimEnd()}\u2026`
  }
  return clean
}

export const cleanTitle = (text: string, notes: Notes) => cleanText(unquote(text.trim()), MAX_TITLE, notes)
export const cleanLabel = (text: string, notes: Notes) => cleanText(unquote(text.trim()), MAX_LABEL, notes)
