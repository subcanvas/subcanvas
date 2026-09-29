import { MEDIA_MIN_SIDE } from "./media"
import type { NodeKind } from "./schema"
import { SHAPE_SIZE, type NodeShape } from "./shapes"

// How long a whiteboard's words may be and how small or large its nodes, in
// one place for the canvas (inspector.tsx, nodes.tsx) and the MCP tools
// (lib/mcp/tools/whiteboard.ts), so an agent can write only what a person
// could.

// Characters.
export const MAX_TITLE = 200 // a node's title, a group's title, a picture's caption
export const MAX_BODY_TEXT = 2000 // the text under a text node's heading
export const MAX_LABEL = 120 // an arrow's label
export const MAX_ALT = 500 // what a picture or a video shows

// Canvas units. The embed draws nothing larger than MAX_NODE_SIDE either.
export const MAX_NODE_SIDE = 4000

// The smallest a node can be resized to. A text node is as tall as its text.
export const MIN_NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  plain: { width: 80, height: 40 },
  text: { width: 120, height: 0 },
  group: { width: 160, height: 100 },
  media: { width: MEDIA_MIN_SIDE, height: MEDIA_MIN_SIDE },
}

// A size someone asked for, kept within what the canvas lets a node of this
// kind be resized to.
export function clampSide(kind: NodeKind, side: "width" | "height", value: number) {
  return Math.min(MAX_NODE_SIDE, Math.max(MIN_NODE_SIZE[kind][side], value))
}

// A box that changes shape while it is still the size its old shape came in
// takes the new shape's size, around the same center: a diamond needs more
// room than a rectangle for the same words. A box somebody has sized keeps
// its size.
export function reshape(
  node: { shape: NodeShape; x: number; y: number; width: number | null; height: number | null },
  shape: NodeShape
) {
  const from = SHAPE_SIZE[node.shape]
  const to = SHAPE_SIZE[shape]
  const untouched = node.width === from.width && node.height === from.height
  return untouched
    ? { shape, ...to, x: node.x + (from.width - to.width) / 2, y: node.y + (from.height - to.height) / 2 }
    : { shape }
}
