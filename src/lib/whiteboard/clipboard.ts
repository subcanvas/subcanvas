import type { Box } from "./arrange"
import type { WbEdge, WbNode } from "./schema"

// What copy puts aside and paste brings back. Pure, so the rules (what comes
// along, what is left behind) can be tested without a canvas.

export type ClipSource = {
  wb: WbNode
  // Where the node is on the whiteboard, whatever group it is in.
  absolute: { x: number; y: number }
  width: number
  height: number
}

export type Clip = {
  // A node whose parent was not copied carries its absolute position, since
  // that parent may not exist where it is pasted. The rest stay relative.
  nodes: WbNode[]
  edges: WbEdge[]
  bounds: Box
  // A plain summary for the system clipboard, so pasting into a chat or a
  // document gives something readable.
  text: string
}

export function collectClip(sources: ClipSource[], edges: WbEdge[], selectedIds: Iterable<string>): Clip | null {
  const copied = new Set(selectedIds)
  // Everything inside a copied group comes along.
  let grew = true
  while (grew) {
    grew = false
    for (const { wb } of sources)
      if (!copied.has(wb.id) && wb.parentId !== null && copied.has(wb.parentId)) {
        copied.add(wb.id)
        grew = true
      }
  }

  const taken = sources.filter((source) => copied.has(source.wb.id))
  if (!taken.length) return null
  const isRoot = ({ wb }: ClipSource) => wb.parentId === null || !copied.has(wb.parentId)
  const roots = taken.filter(isRoot)

  const left = Math.min(...roots.map((root) => root.absolute.x))
  const top = Math.min(...roots.map((root) => root.absolute.y))
  const right = Math.max(...roots.map((root) => root.absolute.x + root.width))
  const bottom = Math.max(...roots.map((root) => root.absolute.y + root.height))

  // Only arrows with both ends copied: an arrow needs two ends.
  const between = edges.filter((edge) => copied.has(edge.source) && copied.has(edge.target))
  const titleOf = (id: string) => taken.find(({ wb }) => wb.id === id)?.wb.title || "Untitled"

  return {
    nodes: taken.map((source) => (isRoot(source) ? { ...source.wb, ...source.absolute } : source.wb)),
    edges: between,
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    text: [
      ...taken.map(({ wb }) => wb.title || "Untitled"),
      ...between.map(
        (edge) => `${titleOf(edge.source)} -> ${titleOf(edge.target)}${edge.label ? `: ${edge.label}` : ""}`
      ),
    ].join("\n"),
  }
}

// The clip's nodes moved by a distance. `parentAt` says which group, if any,
// a top-level copy lands in and where that group is, so the copy's stored
// position can be made relative to it again.
export function placeClip(
  clip: Clip,
  delta: { x: number; y: number },
  parentAt: (node: WbNode, absolute: { x: number; y: number }) => { id: string; x: number; y: number } | null
): WbNode[] {
  const copied = new Set(clip.nodes.map((node) => node.id))
  return clip.nodes.map((node) => {
    if (node.parentId !== null && copied.has(node.parentId)) return node
    const absolute = { x: node.x + delta.x, y: node.y + delta.y }
    const parent = parentAt(node, absolute)
    return {
      ...node,
      parentId: parent?.id ?? null,
      x: absolute.x - (parent?.x ?? 0),
      y: absolute.y - (parent?.y ?? 0),
    }
  })
}
