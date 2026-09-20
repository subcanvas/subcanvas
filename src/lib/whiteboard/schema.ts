import * as Y from "yjs"

import { NODE_SHAPES, type NodeShape } from "./shapes"

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
  // The repository folder this node stands for, when it came from an import
  // ("services/payments"). It is the node's identity there: the title can be
  // changed freely and the node still follows the folder.
  path: string | null
  // The outline of a plain node. Text and groups have one look.
  shape: NodeShape
  // A Lucide icon name and an emoji, each shown as a badge on the corner.
  // Either, both or neither.
  icon: string | null
  emoji: string | null
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
  // Shown in the label, before the words.
  icon: string | null
  emoji: string | null
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

export { COLORS } from "./colors"

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

// An icon is stored by its Lucide name. The name is only checked for form
// here: whether this version can draw it is for whoever draws (icons.ts), so
// a name written by a newer version survives being read by an older one.
const ICON_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
export function iconName(value: unknown) {
  return typeof value === "string" && value.length <= 48 && ICON_NAME.test(value) ? value : null
}

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u

// One emoji and nothing else: a single grapheme (a family or a flag is
// several code points but one grapheme) that a font would draw as a picture.
export function singleEmoji(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 40 || !EMOJI.test(trimmed)) return null
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)]
  return graphemes.length === 1 ? trimmed : null
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
    path: textOrNull(map, "path"),
    shape: pick(map, "shape", NODE_SHAPES, "rectangle"),
    icon: iconName(map.get("icon")),
    emoji: singleEmoji(map.get("emoji")),
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
    icon: iconName(map.get("icon")),
    emoji: singleEmoji(map.get("emoji")),
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
