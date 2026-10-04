import { edgeSides, layoutDiagram, type Frame } from "@/lib/github/layout"
import { findFreeSpot, type Box } from "@/lib/mcp/placement"
import { DEFAULT_SIZE, type WbEdge, type WbNode } from "@/lib/whiteboard/schema"
import { linesThatFit, shapeGeometry, SHAPE_SIZE, type NodeShape } from "@/lib/whiteboard/shapes"

import type { Diagram, DiagramArrow, DiagramBox } from "./diagram"

// A diagram given places and made into whiteboard objects: the same nodes
// and arrows the canvas makes, so the result is an ordinary whiteboard that
// people edit like any other. Flowcharts and ER diagrams are laid out along
// their arrows by the layout an imported repository gets, in the direction
// the diagram asks for; a sequence diagram's participants stand in a row.

export type DrawnPage = { nodeId: string; title: string; markdown: string }

export type DrawnDiagram = {
  // Groups first, outer before inner, then everything else. A node in a
  // group is placed relative to it, as the canvas stores it.
  nodes: WbNode[]
  edges: WbEdge[]
  // Pages to put inside boxes once the boxes exist: an entity's attributes.
  pages: DrawnPage[]
  // The node each Mermaid id became, for whoever goes on to change it.
  keys: Map<string, string>
  width: number
  height: number
}

// The canvas's 13px title, measured roughly: nothing is measured here.
const CHARACTER_WIDTH = 7.2
const LINE_HEIGHT = 17.875
const LABEL_CHARACTER_WIDTH = 6.6
// The widest a box grows for a long title before it takes another line.
const MAX_WIDTH: Partial<Record<NodeShape, number>> = { diamond: 320, ellipse: 300, cloud: 320 }
const DEFAULT_MAX_WIDTH = 280
const TEXT_NODE_HEIGHT = 48
// A sequence diagram's participants: the room between two of them, at least.
const ROW_GAP = 120
const ROW_LABEL_PADDING = 56

// The size a box needs for its title: its shape's own size, wider for a
// long title until two lines fit, then taller for a third.
export function boxSize(shape: NodeShape, title: string) {
  let { width, height } = SHAPE_SIZE[shape]
  const most = MAX_WIDTH[shape] ?? DEFAULT_MAX_WIDTH
  const needed = Math.max(title.length, 1) * CHARACTER_WIDTH
  // Shapes whose text area is a share of their box grow in both directions.
  const grows = shape === "diamond" || shape === "ellipse" || shape === "cloud"
  for (let step = 0; step < 40; step++) {
    const text = shapeGeometry(shape, { x: 0, y: 0, width, height }).text
    const lines = Math.ceil(needed / text.width)
    const fits = linesThatFit(text.height, LINE_HEIGHT, 3)
    if (lines <= Math.min(2, fits)) break
    if (width < most) {
      width = Math.min(most, width + 16)
      if (grows) height += 6
    } else if (lines <= fits || lines > 3) break
    else height += LINE_HEIGHT
  }
  return { width: Math.round(width), height: Math.round(height) }
}

const blankNode = (fields: Partial<WbNode> & Pick<WbNode, "id" | "kind" | "x" | "y" | "title">): WbNode => ({
  width: null,
  height: null,
  parentId: null,
  description: "",
  color: "default",
  docId: null,
  docType: null,
  openMode: "panel",
  path: null,
  codeUrl: null,
  shape: "rectangle",
  icon: null,
  emoji: null,
  mediaPath: null,
  mediaType: null,
  mediaWidth: null,
  mediaHeight: null,
  alt: "",
  ...fields,
})

type Sized = { box: DiagramBox; width: number; height: number }

// Boxes of one shape share a size, so rows and columns line up, as on an
// imported repository's whiteboard.
function sizes(boxes: DiagramBox[]): Sized[] {
  const own = boxes.map((box) =>
    box.kind === "text"
      ? { box, width: DEFAULT_SIZE.text.width!, height: TEXT_NODE_HEIGHT }
      : { box, ...boxSize(box.shape, box.title) }
  )
  const largest = new Map<string, { width: number; height: number }>()
  for (const { box, width, height } of own) {
    const kind = box.kind === "text" ? "text" : box.shape
    const known = largest.get(kind)
    largest.set(kind, { width: Math.max(width, known?.width ?? 0), height: Math.max(height, known?.height ?? 0) })
  }
  return own.map(({ box }) => ({ box, ...largest.get(box.kind === "text" ? "text" : box.shape)! }))
}

export function drawDiagram(
  diagram: Diagram,
  { newId = () => crypto.randomUUID(), at = { x: 0, y: 0 } }: { newId?: () => string; at?: { x: number; y: number } } = {}
): DrawnDiagram {
  const sized = sizes(diagram.boxes)
  const keys = new Map<string, string>()
  for (const { box } of sized) keys.set(box.key, newId())
  for (const group of diagram.groups) keys.set(group.key, newId())

  const placed: {
    nodes: Map<string, { x: number; y: number }>
    clusters: Map<string, Frame>
    sides?: Map<DiagramArrow, Sides>
  } =
    diagram.kind === "sequence"
      ? placeInRow(diagram, sized)
      : layoutDiagram({
          nodes: sized.map(({ box, width, height }) => ({ id: box.key, width, height, parent: box.group })),
          edges: diagram.arrows,
          clusters: diagram.groups.map((group) => ({ id: group.key, parent: group.parent })),
          rankdir: diagram.direction,
        })

  // Where everything is on the board, before it is made relative to its group.
  const frames = new Map<string, Frame>()
  for (const { box, width, height } of sized) {
    const position = placed.nodes.get(box.key)!
    frames.set(box.key, { x: position.x + at.x, y: position.y + at.y, width, height })
  }
  for (const [key, frame] of placed.clusters) frames.set(key, { ...frame, x: frame.x + at.x, y: frame.y + at.y })

  const parentOf = new Map<string, string | null>([
    ...diagram.groups.map((group) => [group.key, group.parent] as const),
    ...diagram.boxes.map((box) => [box.key, box.group] as const),
  ])
  const relative = (key: string) => {
    const frame = frames.get(key)!
    const parent = parentOf.get(key)
    const origin = parent ? frames.get(parent)! : { x: 0, y: 0 }
    return { x: Math.round(frame.x - origin.x), y: Math.round(frame.y - origin.y) }
  }

  const depth = (key: string, seen = new Set<string>()): number => {
    const parent = parentOf.get(key)
    if (!parent || seen.has(key)) return 0
    seen.add(key)
    return depth(parent, seen) + 1
  }
  const groups = [...diagram.groups].sort((a, b) => depth(a.key) - depth(b.key))

  const nodes: WbNode[] = [
    ...groups.map((group) => {
      const frame = frames.get(group.key)!
      return blankNode({
        id: keys.get(group.key)!,
        kind: "group",
        ...relative(group.key),
        width: Math.round(frame.width),
        height: Math.round(frame.height),
        parentId: group.parent ? keys.get(group.parent)! : null,
        title: group.title,
      })
    }),
    ...sized.map(({ box, width, height }) =>
      blankNode({
        id: keys.get(box.key)!,
        kind: box.kind,
        ...relative(box.key),
        width,
        // A text node is as tall as its text.
        height: box.kind === "text" ? null : height,
        parentId: box.group ? keys.get(box.group)! : null,
        title: box.title,
        shape: box.kind === "plain" ? box.shape : "rectangle",
        icon: box.icon ?? null,
      })
    ),
  ]

  const edges: WbEdge[] = diagram.arrows
    .filter((arrow) => !arrow.hidden && keys.has(arrow.source) && keys.has(arrow.target))
    .map((arrow) => {
      const fixed = placed.sides?.get(arrow)
      return {
      id: newId(),
      source: keys.get(arrow.source)!,
      target: keys.get(arrow.target)!,
      ...(fixed
        ? { sourceHandle: fixed.sourceHandle, targetHandle: fixed.targetHandle }
        : edgeSides(frames.get(arrow.source)!, frames.get(arrow.target)!)),
      shape: fixed?.shape ?? "spline",
      stroke: arrow.stroke,
      direction: arrow.direction,
      color: "default",
      label: arrow.label,
      icon: null,
      emoji: null,
      docId: null,
      docType: null,
      openMode: "panel",
      codeUrl: null,
    }
    })

  const pages = diagram.boxes.flatMap((box) => (box.page ? [{ nodeId: keys.get(box.key)!, ...box.page }] : []))

  const all = [...frames.values()]
  return {
    nodes,
    edges,
    pages,
    keys,
    width: Math.max(0, ...all.map((frame) => frame.x + frame.width)) - at.x,
    height: Math.max(0, ...all.map((frame) => frame.y + frame.height)) - at.y,
  }
}

// Between what was on the whiteboard and a diagram added to it, on top of
// the usual gap.
const BESIDE_GAP = 40

// A diagram added to a whiteboard that has things on it already (`taken`,
// the top-level nodes): in free space to the right of them, never on top.
export function drawDiagramBeside(diagram: Diagram, taken: Box[], options: { newId?: () => string } = {}) {
  if (!taken.length) return drawDiagram(diagram, options)
  // Drawn once to learn its size, then again where it fits.
  const { width, height } = drawDiagram(diagram, { newId: () => "" })
  const spot = findFreeSpot(taken, { width: width + BESIDE_GAP, height })
  return drawDiagram(diagram, { ...options, at: { x: spot.x + BESIDE_GAP, y: spot.y } })
}

type Sides = { sourceHandle: string; targetHandle: string; shape: "spline" | "step" }

// A sequence diagram's participants stand in a row, in the order they
// first appear, with room between neighbours for the labels of the arrows
// between them. An arrow to the next participant on the right is a straight
// line; one that goes further, or back, leaves the row and returns to it
// (above for the way along, below for the way back), so it never runs
// behind a box it passes.
function placeInRow(diagram: Diagram, sized: Sized[]) {
  const order = new Map(sized.map(({ box }, index) => [box.key, index]))
  const gaps = sized.map(() => ROW_GAP)
  for (const arrow of diagram.arrows) {
    const from = order.get(arrow.source)!
    const to = order.get(arrow.target)!
    if (to === from + 1)
      gaps[from] = Math.max(gaps[from], arrow.label.length * LABEL_CHARACTER_WIDTH + ROW_LABEL_PADDING)
  }

  const nodes = new Map<string, { x: number; y: number }>()
  const height = Math.max(...sized.map((entry) => entry.height))
  // Room above for the arrows that go along the row past a neighbour.
  const top = diagram.arrows.some((arrow) => order.get(arrow.target)! > order.get(arrow.source)! + 1) ? 48 : 0
  let x = 0
  sized.forEach(({ box, width, height: own }, index) => {
    nodes.set(box.key, { x, y: top + (height - own) / 2 })
    x += width + gaps[index]
  })

  // A group frames its participants, with room for its title.
  const clusters = new Map<string, Frame>()
  const PADDING = 24
  for (const group of diagram.groups) {
    const inside = sized.filter(({ box }) => box.group === group.key)
    if (!inside.length) continue
    const left = Math.min(...inside.map(({ box }) => nodes.get(box.key)!.x))
    const right = Math.max(...inside.map(({ box, width }) => nodes.get(box.key)!.x + width))
    clusters.set(group.key, { x: left - PADDING, y: top - PADDING - 8, width: right - left + PADDING * 2, height: height + PADDING * 2 + 8 })
  }

  const sides = new Map<DiagramArrow, Sides>()
  for (const arrow of diagram.arrows) {
    const from = order.get(arrow.source)!
    const to = order.get(arrow.target)!
    if (to === from + 1) sides.set(arrow, { sourceHandle: "right", targetHandle: "left", shape: "spline" })
    else if (to > from) sides.set(arrow, { sourceHandle: "top", targetHandle: "top", shape: "step" })
    else sides.set(arrow, { sourceHandle: "bottom", targetHandle: "bottom", shape: "step" })
  }
  return { nodes, clusters, sides }
}
