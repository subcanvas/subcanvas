import type { Side } from "./shapes"
import type { WbEdge } from "./schema"

type Box = { x: number; y: number; width: number; height: number }

// The sides an arrow leaves and enters by, so it takes the short way
// between two boxes wherever they are.
export function edgeSides(source: Box, target: Box): { sourceHandle: Side; targetHandle: Side } {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2)
  const dy = target.y + target.height / 2 - (source.y + source.height / 2)
  if (Math.abs(dx) >= Math.abs(dy))
    return dx >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" }
  return dy >= 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" }
}

// The sides an arrow is drawn by, given where its two nodes are now: the
// facing ones, unless it keeps sides chosen on purpose (WbEdge.fixedSides).
export function sidesOf(
  edge: Pick<WbEdge, "sourceHandle" | "targetHandle" | "fixedSides">,
  source: Box,
  target: Box
): { sourceHandle: Side; targetHandle: Side } {
  const facing = edgeSides(source, target)
  if (!edge.fixedSides) return facing
  return {
    sourceHandle: isSide(edge.sourceHandle) ? edge.sourceHandle : facing.sourceHandle,
    targetHandle: isSide(edge.targetHandle) ? edge.targetHandle : facing.targetHandle,
  }
}

const SIDES: readonly string[] = ["top", "right", "bottom", "left"]
const isSide = (value: string | null): value is Side => value !== null && SIDES.includes(value)
