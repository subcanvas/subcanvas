import * as Y from "yjs"

// The shape of a whiteboard inside its Y.Doc. See docs/ARCHITECTURE.md,
// section 3. Every object is a Y.Map of flat scalar fields, so two people
// changing different properties of the same object merge cleanly.

export type NodeKind = "plain" | "text" | "group"
export type EdgeShape = "spline" | "step"
export type EdgeStroke = "solid" | "dotted"
export type EdgeDirection = "none" | "forward" | "reverse" | "both"
export type OpenMode = "panel" | "navigate"
export type DocType = "text" | "whiteboard"
export type ColorKey = (typeof COLOR_KEYS)[number]

export type WbNode = {
  id: string
  kind: NodeKind
  x: number
  y: number
  width: number | null
  height: number | null
  parentId: string | null
  title: string
  description: string
  color: ColorKey
  docId: string | null
  // Kept beside docId so the canvas knows how to open it without a lookup.
  // A document never changes type.
  docType: DocType | null
  openMode: OpenMode
}

export type WbEdge = {
  id: string
  source: string
  target: string
  sourceHandle: string | null
  targetHandle: string | null
  shape: EdgeShape
  stroke: EdgeStroke
  direction: EdgeDirection
  color: ColorKey
  label: string
  docId: string | null
  // Kept beside docId so the canvas knows how to open it without a lookup.
  // A document never changes type.
  docType: DocType | null
  openMode: OpenMode
}

// Colors are stored as keys, not values, so themes can restyle them.
export const COLOR_KEYS = [
  "default", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink",
] as const

// A color is one pencil: a stroke, and a fill that is the same pencil pressed
// lightly onto the sheet. Fills are mixed with the sheet, not made
// transparent, so the grid never shows through and dark mode just works.
const pencil = (label: string, stroke: string) => ({
  label,
  stroke,
  fill: `color-mix(in oklch, ${stroke} 9%, var(--sheet))`,
})

export const COLORS: Record<ColorKey, { label: string; stroke: string; fill: string }> = {
  default: { label: "Ink", stroke: "var(--ink)", fill: "var(--sheet)" },
  red: pencil("Red", "#e5484d"),
  orange: pencil("Orange", "#f76b15"),
  yellow: pencil("Yellow", "#d99a1c"),
  green: pencil("Green", "#2b9a66"),
  teal: pencil("Teal", "#12a594"),
  blue: pencil("Blue", "#0b7fe0"),
  purple: pencil("Purple", "#8e4ec6"),
  pink: pencil("Pink", "#d6409f"),
}

export const DEFAULT_SIZE: Record<NodeKind, { width: number | null; height: number | null }> = {
  plain: { width: 160, height: 64 },
  text: { width: 240, height: null },
  group: { width: 360, height: 240 },
}

// Transactions made by this client's UI carry this origin, which is what
// the undo manager tracks. Remote changes are never undone locally.
export const LOCAL_ORIGIN = "whiteboard-local"

export function nodesMap(doc: Y.Doc) {
  return doc.getMap<Y.Map<unknown>>("nodes")
}

export function edgesMap(doc: Y.Doc) {
  return doc.getMap<Y.Map<unknown>>("edges")
}

function pick<T>(map: Y.Map<unknown>, key: string, allowed: readonly T[], fallback: T): T {
  const value = map.get(key) as T
  return allowed.includes(value) ? value : fallback
}

const text = (map: Y.Map<unknown>, key: string) => {
  const value = map.get(key)
  return typeof value === "string" ? value : ""
}
const textOrNull = (map: Y.Map<unknown>, key: string) => {
  const value = map.get(key)
  return typeof value === "string" && value ? value : null
}
const number = (map: Y.Map<unknown>, key: string, fallback: number) => {
  const value = map.get(key)
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}
const numberOrNull = (map: Y.Map<unknown>, key: string) => {
  const value = map.get(key)
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

// Reads are defensive: the document is shared, so another client (or a
// future version) may have written something unexpected.
export function readNode(id: string, map: Y.Map<unknown>): WbNode {
  return {
    id,
    kind: pick(map, "kind", ["plain", "text", "group"] as const, "plain"),
    x: number(map, "x", 0),
    y: number(map, "y", 0),
    width: numberOrNull(map, "width"),
    height: numberOrNull(map, "height"),
    parentId: textOrNull(map, "parentId"),
    title: text(map, "title"),
    description: text(map, "description"),
    color: pick(map, "color", COLOR_KEYS, "default"),
    docId: textOrNull(map, "docId"),
    docType: textOrNull(map, "docId")
      ? pick(map, "docType", ["text", "whiteboard"] as const, "text")
      : null,
    openMode: pick(map, "openMode", ["panel", "navigate"] as const, "panel"),
  }
}

export function readEdge(id: string, map: Y.Map<unknown>): WbEdge {
  return {
    id,
    source: text(map, "source"),
    target: text(map, "target"),
    sourceHandle: textOrNull(map, "sourceHandle"),
    targetHandle: textOrNull(map, "targetHandle"),
    shape: pick(map, "shape", ["spline", "step"] as const, "spline"),
    stroke: pick(map, "stroke", ["solid", "dotted"] as const, "solid"),
    direction: pick(map, "direction", ["none", "forward", "reverse", "both"] as const, "forward"),
    color: pick(map, "color", COLOR_KEYS, "default"),
    label: text(map, "label"),
    docId: textOrNull(map, "docId"),
    docType: textOrNull(map, "docId")
      ? pick(map, "docType", ["text", "whiteboard"] as const, "text")
      : null,
    openMode: pick(map, "openMode", ["panel", "navigate"] as const, "panel"),
  }
}

export function toYMap(fields: Record<string, unknown>) {
  const map = new Y.Map<unknown>()
  for (const [key, value] of Object.entries(fields))
    if (value !== null && value !== undefined) map.set(key, value)
  return map
}

// Writes only what changed. Null removes the key.
export function patchYMap(map: Y.Map<unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) {
      if (map.has(key)) map.delete(key)
    } else if (map.get(key) !== value) map.set(key, value)
  }
}
