import { edgeSides, layoutBoard } from "@/lib/github/layout"

// Tidies the nodes someone has selected, so that nothing overlaps and every
// label can be read. It is pure: the canvas hands it real sizes (measured on
// screen where none is stored) and writes what comes back in one transaction.

export type ArrangeNode = {
  id: string
  // Relative to the parent, as stored.
  x: number
  y: number
  width: number
  height: number
  parentId: string | null
}
export type ArrangeEdge = {
  id: string
  source: string
  target: string
  label: string
  sourceHandle: string | null
  targetHandle: string | null
}
export type Box = { x: number; y: number; width: number; height: number }
export type Arrangement = {
  // Only what changed. A size is given only for a group that grew.
  nodes: Map<string, { x: number; y: number; width?: number; height?: number }>
  edges: Map<string, { sourceHandle: string; targetHandle: string }>
}

// Room kept between a group's border and what is inside it.
const GROUP_PADDING = 24
const GAP = 36

// Rows of nodes with no arrows between them, tallest first so that each row
// is about one height. The importer's grid gives every node the largest
// one's cell, which scatters small nodes as soon as a group is among them.
function packRows(nodes: ArrangeNode[], minWidth: number) {
  const area = nodes.reduce((sum, node) => sum + (node.width + GAP) * (node.height + GAP), 0)
  // Slightly wider than tall, like the screen it is shown on.
  const rowWidth = Math.max(minWidth, Math.sqrt(area * 1.6), ...nodes.map((node) => node.width))
  const positions = new Map<string, { x: number; y: number }>()
  let x = 0
  let y = 0
  let rowHeight = 0
  for (const node of [...nodes].sort((a, b) => b.height - a.height)) {
    if (x > 0 && x + node.width > rowWidth) {
      x = 0
      y += rowHeight + GAP
      rowHeight = 0
    }
    positions.set(node.id, { x, y })
    x += node.width + GAP
    rowHeight = Math.max(rowHeight, node.height)
  }
  return positions
}

export function arrange(
  allNodes: ArrangeNode[],
  allEdges: ArrangeEdge[],
  selectedIds: Iterable<string>
): Arrangement {
  const selected = new Set(selectedIds)
  const boxes = new Map(allNodes.map((node) => [node.id, { ...node }]))
  const childrenOf = new Map<string | null, string[]>()
  for (const node of allNodes) {
    const parent = node.parentId !== null && boxes.has(node.parentId) ? node.parentId : null
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), node.id])
  }

  const parentOf = (id: string) => {
    const parentId = boxes.get(id)?.parentId ?? null
    return parentId !== null && boxes.has(parentId) ? parentId : null
  }
  const depthOf = (id: string | null) => {
    let depth = 0
    const seen = new Set<string>()
    for (let at = id; at !== null && !seen.has(at); at = parentOf(at)) {
      seen.add(at)
      depth++
    }
    return depth
  }

  // Each set of selected siblings is laid out among themselves. The deepest
  // go first, so a group has its final size by the time it is placed.
  const changed = new Set<string>()
  const parents = [...childrenOf.keys()].sort((a, b) => depthOf(b) - depthOf(a))
  for (const parent of parents) {
    const children = childrenOf.get(parent) ?? []
    const siblings = children.filter((id) => selected.has(id))
    if (siblings.length >= 2) layoutSiblings(siblings)
    if (parent !== null && children.some((id) => changed.has(id))) growToFit(parent)
  }

  function layoutSiblings(ids: string[]) {
    const members = new Set(ids)
    // An arrow to something inside a group counts as an arrow to the group.
    const lift = (id: string) => {
      const seen = new Set<string>()
      for (let at: string | null = id; at !== null && !seen.has(at); at = parentOf(at)) {
        if (members.has(at)) return at
        seen.add(at)
      }
      return null
    }
    const edges = allEdges.flatMap((edge) => {
      const source = lift(edge.source)
      const target = lift(edge.target)
      return source && target && source !== target ? [{ source, target, label: edge.label }] : []
    })

    const nodes = ids.map((id) => boxes.get(id)!)
    const joined = new Set(edges.flatMap((edge) => [edge.source, edge.target]))
    // Nodes joined by arrows follow them, left to right. The rest go in rows
    // underneath.
    const flow = nodes.filter((node) => joined.has(node.id))
    const positions = layoutBoard(flow, edges)
    const flowWidth = Math.max(0, ...flow.map((node) => positions.get(node.id)!.x + node.width))
    const flowBottom = Math.max(-GAP * 2, ...flow.map((node) => positions.get(node.id)!.y + node.height))
    const loose = nodes.filter((node) => !joined.has(node.id))
    for (const [id, position] of packRows(loose, flowWidth))
      positions.set(id, { x: position.x, y: position.y + flowBottom + GAP * 2 })
    // Anchored where the selection's top-left corner already was, so the
    // result appears under the person's eyes and not somewhere else.
    const left = Math.min(...nodes.map((node) => node.x))
    const top = Math.min(...nodes.map((node) => node.y))
    for (const node of nodes) {
      const position = positions.get(node.id)!
      node.x = Math.round(left + position.x)
      node.y = Math.round(top + position.y)
      changed.add(node.id)
    }
  }

  // A group never shrinks here, it only makes room for what is inside it.
  function growToFit(groupId: string) {
    const group = boxes.get(groupId)!
    for (const id of childrenOf.get(groupId) ?? []) {
      const child = boxes.get(id)!
      group.width = Math.max(group.width, child.x + child.width + GROUP_PADDING)
      group.height = Math.max(group.height, child.y + child.height + GROUP_PADDING)
    }
    changed.add(groupId)
  }

  const absolute = (source: Map<string, ArrangeNode>, id: string): Box => {
    const node = source.get(id)!
    let { x, y } = node
    const seen = new Set([id])
    for (let at = parentOf(id); at !== null && !seen.has(at); at = parentOf(at)) {
      seen.add(at)
      x += source.get(at)!.x
      y += source.get(at)!.y
    }
    return { x, y, width: node.width, height: node.height }
  }

  const before = new Map(allNodes.map((node) => [node.id, node]))
  const result: Arrangement = { nodes: new Map(), edges: new Map() }
  const moved = new Set<string>()
  for (const node of allNodes) {
    const now = boxes.get(node.id)!
    const resized = now.width !== node.width || now.height !== node.height
    if (resized || now.x !== node.x || now.y !== node.y)
      result.nodes.set(node.id, {
        x: now.x,
        y: now.y,
        ...(resized ? { width: now.width, height: now.height } : {}),
      })
    const was = absolute(before, node.id)
    const is = absolute(boxes, node.id)
    if (was.x !== is.x || was.y !== is.y || was.width !== is.width || was.height !== is.height)
      moved.add(node.id)
  }

  // An arrow between things that moved leaves and enters by the sides that
  // now face each other. Left on its old sides it could loop back across a
  // node, and its label sits at the middle of that loop.
  for (const edge of allEdges) {
    if (!boxes.has(edge.source) || !boxes.has(edge.target)) continue
    if (!moved.has(edge.source) && !moved.has(edge.target)) continue
    const sides = edgeSides(absolute(boxes, edge.source), absolute(boxes, edge.target))
    if (sides.sourceHandle !== edge.sourceHandle || sides.targetHandle !== edge.targetHandle)
      result.edges.set(edge.id, sides)
  }

  return result
}
