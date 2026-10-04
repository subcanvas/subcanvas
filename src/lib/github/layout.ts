import dagre from "@dagrejs/dagre"

// Where the nodes of an imported whiteboard go. This runs once, on import;
// after that the positions belong to whoever moves them.

export type LayoutNode = { id: string; width: number; height: number }
export type LayoutEdge = { source: string; target: string; label: string }
export type Position = { x: number; y: number }
type Side = "top" | "right" | "bottom" | "left"

const NODE_GAP = 36
// Between columns of a flow: room for an arrow and its label.
const RANK_GAP = 96
const GRID_GAP_X = 40
const GRID_GAP_Y = 36
const LABEL_CHARACTER_WIDTH = 6.5

// Nodes joined by arrows are laid out left to right along them. The rest
// have no order to show, so they go in a grid underneath, which reads far
// better than the single tall column a graph layout makes of loose nodes.
export function layoutBoard(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, Position> {
  const known = new Set(nodes.map((node) => node.id))
  const drawn = edges.filter((edge) => known.has(edge.source) && known.has(edge.target))
  const joined = new Set(drawn.flatMap((edge) => [edge.source, edge.target]))

  const positions = new Map<string, Position>()
  let bottom = 0

  if (joined.size) {
    const graph = new dagre.graphlib.Graph({ multigraph: true })
    graph.setGraph({ rankdir: "LR", nodesep: NODE_GAP, ranksep: RANK_GAP, marginx: 0, marginy: 0 })
    for (const node of nodes)
      if (joined.has(node.id)) graph.setNode(node.id, { width: node.width, height: node.height })
    // An arrow that skips a column is drawn straight from box to box, not
    // along the detour dagre plans for it. So its lane is as tall as a node:
    // whatever it skips is then pushed clear of the line, not half under it.
    const lane = Math.max(...nodes.map((node) => node.height))
    drawn.forEach((edge, index) =>
      graph.setEdge(
        edge.source,
        edge.target,
        { width: edge.label.length * LABEL_CHARACTER_WIDTH, height: lane, labelpos: "c" },
        String(index)
      )
    )
    dagre.layout(graph)

    for (const node of nodes) {
      if (!joined.has(node.id)) continue
      // Dagre places centers; the whiteboard places top-left corners.
      const { x, y } = graph.node(node.id)
      positions.set(node.id, { x: x - node.width / 2, y: y - node.height / 2 })
      bottom = Math.max(bottom, y + node.height / 2)
    }
    // Dagre's origin depends on its margins and labels. Start at zero.
    const left = Math.min(...[...positions.values()].map((position) => position.x))
    const top = Math.min(...[...positions.values()].map((position) => position.y))
    for (const position of positions.values()) {
      position.x -= left
      position.y -= top
    }
    bottom += GRID_GAP_Y * 2 - top
  }

  const loose = nodes.filter((node) => !joined.has(node.id))
  if (loose.length) {
    // Slightly wider than tall, like the screen it is shown on.
    const columns = Math.min(6, Math.ceil(Math.sqrt(loose.length * 1.6)))
    const cellWidth = Math.max(...loose.map((node) => node.width)) + GRID_GAP_X
    const cellHeight = Math.max(...loose.map((node) => node.height)) + GRID_GAP_Y
    loose.forEach((node, index) =>
      positions.set(node.id, {
        x: (index % columns) * cellWidth,
        y: bottom + Math.floor(index / columns) * cellHeight,
      })
    )
  }

  return positions
}

export type Rankdir = "TB" | "BT" | "LR" | "RL"
export type Frame = Position & { width: number; height: number }

// An empty group still takes room on the board.
const EMPTY_GROUP = { width: 200, height: 100 }
const LABEL_HEIGHT = 28
// A label's pill is wider than its words.
const LABEL_PADDING = 16
const MAX_FANNED_GAP = 240

// A diagram drawn from a description of it (a Mermaid import): every node
// is placed along the arrows, in the direction the description asks for,
// and groups (`clusters`) are drawn around what they hold. An arrow may end
// on a group; it is placed as if it ended on the group's first node.
// Returns top-left corners, and each group's frame, both on the board.
export function layoutDiagram({
  nodes,
  edges,
  clusters,
  rankdir,
}: {
  nodes: (LayoutNode & { parent: string | null })[]
  edges: (LayoutEdge & { length?: number })[]
  clusters: { id: string; parent: string | null }[]
  rankdir: Rankdir
}): { nodes: Map<string, Position>; clusters: Map<string, Frame> } {
  const across = rankdir === "LR" || rankdir === "RL"
  // An arrow's label is drawn halfway along it. Two arrows that fan out
  // from one node (or into one) have their middles half as far apart as
  // their other ends, so in a diagram that flows down, the nodes they reach
  // stand far enough apart for two labels side by side.
  const fanned = (end: "source" | "target") => {
    const counts = new Map<string, number>()
    for (const edge of edges) if (edge.label) counts.set(edge[end], (counts.get(edge[end]) ?? 0) + 1)
    return edges.filter((edge) => edge.label && counts.get(edge[end])! > 1)
  }
  const widestFanned = Math.max(
    0,
    ...[...fanned("source"), ...fanned("target")].map((edge) => edge.label.length * LABEL_CHARACTER_WIDTH + LABEL_PADDING)
  )
  const narrowest = Math.min(...nodes.map((node) => node.width))
  const nodesep = across ? NODE_GAP : Math.min(MAX_FANNED_GAP, Math.max(NODE_GAP, widestFanned * 2 - narrowest))

  const graph = new dagre.graphlib.Graph({ multigraph: true, compound: true })
  graph.setGraph({ rankdir, nodesep, ranksep: RANK_GAP, marginx: 0, marginy: 0 })

  const holds = new Map<string, string[]>()
  const hold = (parent: string | null, child: string) => {
    if (parent) holds.set(parent, [...(holds.get(parent) ?? []), child])
  }
  for (const node of nodes) hold(node.parent, node.id)
  for (const cluster of clusters) hold(cluster.parent, cluster.id)
  const known = new Set(nodes.map((node) => node.id))
  // The first node inside a group, at any depth, stands in for it.
  const standIn = (id: string, seen = new Set<string>()): string | null => {
    if (known.has(id) || !holds.has(id)) return id
    if (seen.has(id)) return null
    seen.add(id)
    for (const child of holds.get(id)!) {
      const found = standIn(child, seen)
      if (found) return found
    }
    return null
  }

  for (const node of nodes) graph.setNode(node.id, { width: node.width, height: node.height })
  for (const cluster of clusters) graph.setNode(cluster.id, holds.has(cluster.id) ? {} : { ...EMPTY_GROUP })
  for (const node of nodes) if (node.parent) graph.setParent(node.id, node.parent)
  for (const cluster of clusters) if (cluster.parent) graph.setParent(cluster.id, cluster.parent)

  const lane = across
    ? Math.max(0, ...nodes.map((node) => node.height))
    : Math.max(0, ...nodes.map((node) => node.width))
  edges.forEach((edge, index) => {
    const source = standIn(edge.source)
    const target = standIn(edge.target)
    if (!source || !target || source === target || !graph.hasNode(source) || !graph.hasNode(target)) return
    const text = edge.label.length * LABEL_CHARACTER_WIDTH
    // As in layoutBoard: a label's lane is as wide as a node across the
    // flow, so whatever an arrow skips is pushed clear of it.
    const label = across ? { width: text, height: lane } : { width: Math.max(text, lane), height: LABEL_HEIGHT }
    graph.setEdge(source, target, { ...label, labelpos: "c", minlen: edge.length ?? 1 }, String(index))
  })
  dagre.layout(graph)

  const placed = new Map<string, Position>()
  const frames = new Map<string, Frame>()
  for (const node of nodes) {
    const { x, y } = graph.node(node.id)
    placed.set(node.id, { x: x - node.width / 2, y: y - node.height / 2 })
  }
  for (const cluster of clusters) {
    const { x, y, width, height } = graph.node(cluster.id)
    frames.set(cluster.id, { x: x - width / 2, y: y - height / 2, width, height })
  }
  // Dagre's origin depends on its margins and labels. Start at zero.
  const all = [...placed.values(), ...frames.values()]
  const left = Math.min(...all.map((position) => position.x))
  const top = Math.min(...all.map((position) => position.y))
  for (const position of all) {
    position.x -= left
    position.y -= top
  }
  return { nodes: placed, clusters: frames }
}

// The sides an arrow leaves and enters by, so it takes the short way
// between two nodes wherever the layout put them.
export function edgeSides(
  source: Position & { width: number; height: number },
  target: Position & { width: number; height: number }
): { sourceHandle: Side; targetHandle: Side } {
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

const MIN_NODE_WIDTH = 160
const MAX_NODE_WIDTH = 260

// Wide enough for the title and the folder path beneath it, within reason:
// past the cap the node truncates them. Widths are estimated from character
// counts, since nothing is measured on the server.
export function nodeWidth(title: string, path: string | null) {
  const needed = Math.max(title.length * 7.6, (path?.length ?? 0) * 6.2) + 36
  return Math.round(Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, needed)))
}
