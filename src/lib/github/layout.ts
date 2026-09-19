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
    drawn.forEach((edge, index) =>
      graph.setEdge(
        edge.source,
        edge.target,
        { width: edge.label.length * LABEL_CHARACTER_WIDTH, height: 20, labelpos: "c" },
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
