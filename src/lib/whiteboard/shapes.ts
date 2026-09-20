// The outlines a plain node can take. Everything about a shape is worked out
// here, as plain numbers and SVG path data, so the canvas (nodes.tsx) and the
// image renderer (render-svg.ts) draw the same thing from the same source.

export const NODE_SHAPES = [
  "rectangle",
  "rounded",
  "ellipse",
  "diamond",
  "hexagon",
  "cylinder",
  "parallelogram",
  "document",
  "cloud",
] as const

export type NodeShape = (typeof NODE_SHAPES)[number]

export const SHAPE_LABELS: Record<NodeShape, string> = {
  rectangle: "Rectangle",
  rounded: "Pill",
  ellipse: "Ellipse",
  diamond: "Diamond",
  hexagon: "Hexagon",
  cylinder: "Cylinder",
  parallelogram: "Parallelogram",
  document: "Document",
  cloud: "Cloud",
}

// The size a shape is comfortable at: room for a two-line title inside its
// safe area. A diamond only has half its box to write in, so it starts larger.
export const SHAPE_SIZE: Record<NodeShape, { width: number; height: number }> = {
  rectangle: { width: 160, height: 64 },
  rounded: { width: 160, height: 64 },
  ellipse: { width: 168, height: 84 },
  diamond: { width: 184, height: 112 },
  hexagon: { width: 184, height: 72 },
  cylinder: { width: 144, height: 100 },
  parallelogram: { width: 184, height: 64 },
  document: { width: 160, height: 84 },
  cloud: { width: 192, height: 116 },
}

export type Side = "top" | "right" | "bottom" | "left"
export type Point = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }

export type ShapeGeometry = {
  // The closed outline, as SVG path data.
  outline: string
  // A line drawn on top of the outline without being part of it: the near
  // rim of a cylinder's lid.
  detail: string | null
  // Where an edge meets the shape on each side. On the visible boundary,
  // which for a parallelogram or a cloud is not the middle of the box's side.
  anchors: Record<Side, Point>
  // The area the title can use without touching the outline.
  text: Box
  // Where the badge in the top right corner is centered: on the outline, so
  // the badge hangs on the shape and not in the empty corner of its box.
  badge: Point
  // How far each sheet of the stack behind the node is moved from the one
  // in front of it.
  stackStep: Point
}

// Two decimals is finer than a screen can show, and keeps an image small.
const n = (value: number) => String(Math.round(value * 100) / 100)

// Down and to the right, as the `sheet-stack` utility does (--stack-offset).
const STACK_STEP: Point = { x: 4, y: 4 }

const RADIUS = 8
// A one pixel border plus the rectangle's padding (px-3 py-2 on the canvas).
const PAD_X = 13
const PAD_Y = 9

function roundedRect({ x, y, width, height }: Box, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  const right = x + width
  const bottom = y + height
  return (
    `M${n(x + r)} ${n(y)}H${n(right - r)}A${n(r)} ${n(r)} 0 0 1 ${n(right)} ${n(y + r)}` +
    `V${n(bottom - r)}A${n(r)} ${n(r)} 0 0 1 ${n(right - r)} ${n(bottom)}` +
    `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(bottom - r)}` +
    `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  )
}

const polygon = (points: Point[]) =>
  `${points.map((point, i) => `${i ? "L" : "M"}${n(point.x)} ${n(point.y)}`).join("")}Z`

// --- The cloud --------------------------------------------------------------

// A cloud is the outline of four overlapping circles standing on a flat
// base, described in a unit square and stretched to the node's box (a circle
// stretched along the axes is an ellipse, which an SVG arc can still draw).
// Clockwise from the bottom left: the left puff, a small one on its shoulder,
// the crown, and the right puff.
const CLOUD_PUFFS = [
  { x: 0.24, y: 0.76, r: 0.24 },
  { x: 0.3, y: 0.44, r: 0.19 },
  { x: 0.55, y: 0.36, r: 0.36 },
  { x: 0.74, y: 0.74, r: 0.26 },
]
const CLOUD_MIDDLE = { x: 0.5, y: 0.6 }

type Arc = { r: number; large: boolean; to: Point }

// Where two neighboring puffs cross, on the outside of the cloud.
function crossing(a: (typeof CLOUD_PUFFS)[number], b: (typeof CLOUD_PUFFS)[number]): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distance = Math.hypot(dx, dy)
  const along = (a.r * a.r - b.r * b.r + distance * distance) / (2 * distance)
  const across = Math.sqrt(Math.max(a.r * a.r - along * along, 0))
  const foot = { x: a.x + (dx * along) / distance, y: a.y + (dy * along) / distance }
  const candidates = [1, -1].map((sign) => ({
    x: foot.x + (sign * across * -dy) / distance,
    y: foot.y + (sign * across * dx) / distance,
  }))
  const reach = (point: Point) => Math.hypot(point.x - CLOUD_MIDDLE.x, point.y - CLOUD_MIDDLE.y)
  return reach(candidates[0]) >= reach(candidates[1]) ? candidates[0] : candidates[1]
}

const CLOUD_START: Point = { x: CLOUD_PUFFS[0].x, y: CLOUD_PUFFS[0].y + CLOUD_PUFFS[0].r }
const CLOUD_ARCS: Arc[] = (() => {
  const last = CLOUD_PUFFS[CLOUD_PUFFS.length - 1]
  const stops = [
    CLOUD_START,
    ...CLOUD_PUFFS.slice(1).map((puff, i) => crossing(CLOUD_PUFFS[i], puff)),
    { x: last.x, y: last.y + last.r },
  ]
  return CLOUD_PUFFS.map((puff, i) => {
    const from = Math.atan2(stops[i].y - puff.y, stops[i].x - puff.x)
    const to = Math.atan2(stops[i + 1].y - puff.y, stops[i + 1].x - puff.x)
    // With y pointing down, a growing angle is a clockwise turn.
    const turn = (to - from + Math.PI * 2) % (Math.PI * 2)
    return { r: puff.r, large: turn > Math.PI, to: stops[i + 1] }
  })
})()

// Where the outline crosses the middle of each side of the unit square.
const CLOUD_ANCHORS: Record<Side, Point> = (() => {
  const [, shoulder, crown] = CLOUD_PUFFS
  const chord = (puff: typeof crown, offset: number) => Math.sqrt(puff.r * puff.r - offset * offset)
  return {
    top: { x: 0.5, y: crown.y - chord(crown, 0.5 - crown.x) },
    right: { x: crown.x + chord(crown, 0.5 - crown.y), y: 0.5 },
    bottom: { x: 0.5, y: 1 },
    left: { x: shoulder.x - chord(shoulder, 0.5 - shoulder.y), y: 0.5 },
  }
})()

// The point of the crown that faces the top right corner.
const CLOUD_BADGE: Point = {
  x: CLOUD_PUFFS[2].x + CLOUD_PUFFS[2].r * Math.SQRT1_2,
  y: CLOUD_PUFFS[2].y - CLOUD_PUFFS[2].r * Math.SQRT1_2,
}

function cloudOutline(box: Box) {
  const at = (point: Point) => `${n(box.x + point.x * box.width)} ${n(box.y + point.y * box.height)}`
  return (
    `M${at(CLOUD_START)}` +
    CLOUD_ARCS.map(
      (arc) => `A${n(arc.r * box.width)} ${n(arc.r * box.height)} 0 ${arc.large ? 1 : 0} 1 ${at(arc.to)}`
    ).join("") +
    "Z"
  )
}

// --- Every shape ------------------------------------------------------------

const inset = (box: Box, left: number, top: number, right = left, bottom = top): Box => ({
  x: box.x + left,
  y: box.y + top,
  // Never inside out, however small the node is made.
  width: Math.max(box.width - left - right, 1),
  height: Math.max(box.height - top - bottom, 1),
})

export function shapeGeometry(shape: NodeShape, box: Box): ShapeGeometry {
  const { x, y, width: w, height: h } = box
  // The stroke is one pixel wide and centered on the path, so the path runs
  // half a pixel inside the box: the border lands on whole pixels.
  const line = inset(box, 0.5, 0.5)
  const right = x + w
  const bottom = y + h
  const middle = { x: x + w / 2, y: y + h / 2 }
  const sides: Record<Side, Point> = {
    top: { x: middle.x, y },
    right: { x: right, y: middle.y },
    bottom: { x: middle.x, y: bottom },
    left: { x, y: middle.y },
  }
  const corner = { x: right, y }

  switch (shape) {
    case "rectangle":
      return {
        outline: roundedRect(line, RADIUS - 0.5),
        detail: null,
        anchors: sides,
        text: inset(box, PAD_X, PAD_Y),
        badge: corner,
        stackStep: STACK_STEP,
      }

    case "rounded": {
      const r = Math.min(w, h) / 2
      return {
        outline: roundedRect(line, r),
        detail: null,
        anchors: sides,
        text: inset(box, Math.max(PAD_X, r * 0.5), PAD_Y),
        // Where the flat top ends and the round end begins.
        badge: { x: right - r, y },
        stackStep: STACK_STEP,
      }
    }

    case "ellipse":
      return {
        outline:
          `M${n(line.x)} ${n(middle.y)}` +
          `A${n(line.width / 2)} ${n(line.height / 2)} 0 1 1 ${n(line.x + line.width)} ${n(middle.y)}` +
          `A${n(line.width / 2)} ${n(line.height / 2)} 0 1 1 ${n(line.x)} ${n(middle.y)}Z`,
        detail: null,
        anchors: sides,
        // A little more than the inscribed rectangle: a centered title is
        // narrowest on its first and last line, where the ellipse is too.
        text: inset(box, w * 0.13, h * 0.13),
        badge: { x: middle.x + (w / 2) * Math.SQRT1_2, y: middle.y - (h / 2) * Math.SQRT1_2 },
        stackStep: STACK_STEP,
      }

    case "diamond":
      return {
        outline: polygon([
          { x: middle.x, y: line.y },
          { x: line.x + line.width, y: middle.y },
          { x: middle.x, y: line.y + line.height },
          { x: line.x, y: middle.y },
        ]),
        detail: null,
        anchors: sides,
        text: inset(box, w * 0.22, h * 0.24),
        // A third of the way down the top right edge.
        badge: { x: middle.x + w / 6, y: y + h / 6 },
        // Straight down: moved diagonally, the sheets would hide behind one
        // of the lower edges and crowd the other.
        stackStep: { x: 0, y: 5 },
      }

    case "hexagon": {
      // Regular corners (60 degrees) until the node gets too narrow for them.
      const cut = Math.min(h * 0.29, w / 4)
      return {
        outline: polygon([
          { x: line.x + cut, y: line.y },
          { x: line.x + line.width - cut, y: line.y },
          { x: line.x + line.width, y: middle.y },
          { x: line.x + line.width - cut, y: line.y + line.height },
          { x: line.x + cut, y: line.y + line.height },
          { x: line.x, y: middle.y },
        ]),
        detail: null,
        anchors: sides,
        text: inset(box, cut * 0.75 + 8, PAD_Y),
        badge: { x: right - cut, y },
        stackStep: STACK_STEP,
      }
    }

    case "cylinder": {
      // Half the height of the lid.
      const lid = Math.min(h * 0.14, 14)
      const rx = line.width / 2
      const lower = line.y + line.height - lid
      return {
        outline:
          `M${n(line.x)} ${n(line.y + lid)}` +
          `A${n(rx)} ${n(lid)} 0 0 1 ${n(line.x + line.width)} ${n(line.y + lid)}` +
          `V${n(lower)}` +
          `A${n(rx)} ${n(lid)} 0 0 1 ${n(line.x)} ${n(lower)}Z`,
        detail: `M${n(line.x)} ${n(line.y + lid)}A${n(rx)} ${n(lid)} 0 0 0 ${n(line.x + line.width)} ${n(line.y + lid)}`,
        anchors: sides,
        text: inset(box, PAD_X, lid * 2 + 5, PAD_X, lid + 3),
        // On the far rim of the lid, towards the corner.
        badge: { x: middle.x + (w / 2) * Math.SQRT1_2, y: y + lid * (1 - Math.SQRT1_2) },
        stackStep: STACK_STEP,
      }
    }

    case "parallelogram": {
      const lean = Math.min(h * 0.4, w / 4)
      return {
        outline: polygon([
          { x: line.x + lean, y: line.y },
          { x: line.x + line.width, y: line.y },
          { x: line.x + line.width - lean, y: line.y + line.height },
          { x: line.x, y: line.y + line.height },
        ]),
        detail: null,
        anchors: {
          ...sides,
          // The slanted sides are half a lean in from the box at mid height.
          right: { x: right - lean / 2, y: middle.y },
          left: { x: x + lean / 2, y: middle.y },
        },
        text: inset(box, lean * 0.75 + 8, PAD_Y),
        badge: corner,
        stackStep: STACK_STEP,
      }
    }

    case "document": {
      // The bottom edge is one wave: down on the left, up on the right. It
      // crosses its own middle line exactly under the middle of the node.
      const wave = Math.min(h * 0.11, 10)
      const rest = line.y + line.height - wave
      const r = 6
      return {
        outline:
          `M${n(line.x)} ${n(line.y + r)}A${r} ${r} 0 0 1 ${n(line.x + r)} ${n(line.y)}` +
          `H${n(line.x + line.width - r)}A${r} ${r} 0 0 1 ${n(line.x + line.width)} ${n(line.y + r)}` +
          `V${n(rest)}` +
          `Q${n(line.x + line.width * 0.75)} ${n(rest - wave * 2)} ${n(middle.x)} ${n(rest)}` +
          `T${n(line.x)} ${n(rest)}Z`,
        detail: null,
        anchors: { ...sides, bottom: { x: middle.x, y: bottom - wave - 0.5 } },
        text: inset(box, PAD_X, PAD_Y, PAD_X, wave * 2 + 4),
        badge: corner,
        stackStep: STACK_STEP,
      }
    }

    case "cloud": {
      const at = (point: Point) => ({ x: x + point.x * w, y: y + point.y * h })
      return {
        outline: cloudOutline(line),
        detail: null,
        anchors: {
          top: at(CLOUD_ANCHORS.top),
          right: at(CLOUD_ANCHORS.right),
          bottom: at(CLOUD_ANCHORS.bottom),
          left: at(CLOUD_ANCHORS.left),
        },
        text: inset(box, w * 0.2, h * 0.3, w * 0.16, h * 0.14),
        badge: at(CLOUD_BADGE),
        stackStep: STACK_STEP,
      }
    }
  }
}

// How many lines of a title fit in `height`, between one and `most`.
export const linesThatFit = (height: number, lineHeight: number, most: number) =>
  Math.min(most, Math.max(1, Math.floor(height / lineHeight)))
