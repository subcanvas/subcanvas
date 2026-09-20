import { COLORS } from "./colors"
import { iconNode } from "./icons"
import { DEFAULT_SIZE, singleEmoji, type ColorKey, type WbEdge, type WbNode } from "./schema"
import { linesThatFit, shapeGeometry, type Box, type Point, type Side } from "./shapes"

// A whiteboard drawn as a standalone SVG string: no browser, no React Flow.
// It is what an embed in a README shows (docs/ROADMAP.md, section 4), so it
// follows components/whiteboard/nodes.tsx and edge.tsx shape for shape.
//
// The result is served as an image, to anyone, from user input. So every
// piece of text is escaped, and nothing here emits a script, a
// foreignObject, a stylesheet, or a reference to another file. That last
// rule is why a picture on the whiteboard is drawn as a frame and not shown:
// an image inside an image is either a reference, which GitHub's image proxy
// and a browser showing an <img> both refuse to follow, or the file's bytes
// inlined, which would put megabytes into a response meant to be small and
// asked for again every few minutes.

export type SvgTheme = "light" | "dark"

type Pencil = Exclude<ColorKey, "default">

type Palette = {
  paper: string
  sheet: string
  ink: string
  graphite: string
  rule: string
  blueline: string
  pencilText: Record<Pencil, string>
}

// The same values as the tokens at the top of app/globals.css. An image
// cannot read CSS variables from the page around it, so they are repeated.
const PALETTES: Record<SvgTheme, Palette> = {
  light: {
    paper: "#f4f6fa",
    sheet: "#ffffff",
    ink: "#10162f",
    graphite: "#59627a",
    rule: "#dde3ee",
    blueline: "#9ccbe8",
    pencilText: {
      red: "#ce2c31",
      orange: "#bd4b00",
      yellow: "#946800",
      green: "#1f7d54",
      teal: "#007a6a",
      blue: "#0b68cb",
      purple: "#8145b5",
      pink: "#c2298a",
    },
  },
  dark: {
    paper: "#171717",
    sheet: "#171717",
    ink: "#ededed",
    graphite: "#a1a1a1",
    rule: "#333333",
    blueline: "#525252",
    pencilText: {
      red: "#ff8f8c",
      orange: "#ffa057",
      yellow: "#f5c542",
      green: "#46d08e",
      teal: "#2fd0b5",
      blue: "#70b8ff",
      purple: "#c99bf5",
      pink: "#ff8dcc",
    },
  },
}

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
// An image cannot bring a font along, so an emoji is drawn by whatever emoji
// font the viewer has: the same emoji, in their system's style.
const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

// Space around the content, and the strip under it that holds the mark.
const PADDING = 32
const FOOTER = 20
// How far the sheets behind a node peek out (--stack-offset).
const STACK_OFFSET = 4
// The furthest the two sheets behind any shape reach (shapes.ts, stackStep).
const STACK_REACH = 10
// The distance a step edge travels straight out of a node before it turns.
const STEP_GAP = 20

// Limits for a document that is broken or hostile. A real whiteboard comes
// nowhere near them.
const MAX_OBJECTS = 2000
const MAX_COORDINATE = 100_000
const MAX_NODE_SIZE = 4000
const MAX_TEXT_LINES = 40
const MAX_IMAGE_SIDE = 4000

const SIDES: readonly Side[] = ["top", "right", "bottom", "left"]
const NORMALS: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

// XML 1.0 forbids most control characters even when escaped, and one of
// them makes the whole image fail to parse. Lone surrogates go too.
const FORBIDDEN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

export function escapeXml(value: string) {
  return value
    .replace(FORBIDDEN, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Two decimals is finer than a screen can show, and keeps the file small.
const n = (value: number) => String(Math.round(value * 100) / 100)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// `percent` of `color` over `base`, mixed in sRGB. The app mixes in oklch;
// at the small amounts used here the two are a shade apart at most.
function mix(color: string, percent: number, base: string) {
  const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
  const [from, to] = [channels(base), channels(color)]
  const mixed = from.map((channel, i) => Math.round(channel + ((to[i] - channel) * percent) / 100))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

// --- Text -----------------------------------------------------------------

// There is no font to measure with, so a character's width is estimated
// from its class, in ems. The estimates lean wide: text that wraps a little
// early looks fine, and text that runs out of its box does not.
function charWidth(char: string, mono: boolean) {
  if (mono) return 0.62
  if (/[\u2E80-\uFFFF]/.test(char) || char.length > 1) return 1.05
  if (/[ijl.,:;'|!]/.test(char)) return 0.28
  if (/[ftrI()[\]{}\-/\\ "*]/.test(char)) return 0.37
  if (/[MW@%]/.test(char)) return 0.96
  if (/[mw]/.test(char)) return 0.84
  if (/[A-Z0-9#&?]/.test(char)) return 0.7
  return 0.58
}

function textWidth(text: string, fontSize: number, mono = false) {
  let ems = 0
  for (const char of text) ems += charWidth(char, mono)
  return ems * fontSize
}

// Cuts `text` so that it fits, ending in an ellipsis when something was cut.
function truncate(text: string, maxWidth: number, fontSize: number, mono = false) {
  if (textWidth(text, fontSize, mono) <= maxWidth) return text
  const chars = [...text]
  while (chars.length && textWidth(`${chars.join("")}…`, fontSize, mono) > maxWidth) chars.pop()
  return `${chars.join("").trimEnd()}…`
}

// Wraps at spaces, keeps the author's line breaks, and breaks a word only
// when it is wider than a whole line (a URL, say), as `break-words` does.
function wrap(text: string, maxWidth: number, fontSize: number) {
  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (textWidth(candidate, fontSize) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      line = ""
      for (const char of word) {
        if (line && textWidth(line + char, fontSize) > maxWidth) {
          lines.push(line)
          line = ""
        }
        line += char
      }
    }
    lines.push(line)
  }
  return lines
}

// At most `max` lines; the last one says that more was left out.
function clampLines(lines: string[], max: number, maxWidth: number, fontSize: number) {
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  kept[max - 1] = truncate(`${kept[max - 1]}…`, maxWidth, fontSize)
  return kept
}

// Lines of text with the first line's box starting at `top`. SVG places
// text by its baseline, which sits about a third of the font size below the
// middle of the line.
function textLines(
  lines: string[],
  { x, top, lineHeight, fontSize, attributes }: { x: number; top: number; lineHeight: number; fontSize: number; attributes: string }
) {
  return lines
    .map((line, i) => {
      const baseline = top + lineHeight * i + lineHeight / 2 + fontSize * 0.35
      return `<text x="${n(x)}" y="${n(baseline)}" font-size="${fontSize}" ${attributes}>${escapeXml(line)}</text>`
    })
    .join("")
}

// --- Layout ---------------------------------------------------------------

const PLAIN_TEXT = { fontSize: 13, lineHeight: 17.875, maxLines: 3 }
// The folder path under a repository node's name (10px mono on the canvas).
const PATH_TEXT = { fontSize: 10, lineHeight: 12.5, gap: 2 }
const HEADING = { fontSize: 18, lineHeight: 22.5 }
const BODY = { fontSize: 13, lineHeight: 21.125 }
const TEXT_PADDING = 8
const TEXT_GAP = 4

type TextLayout = { heading: string[]; body: string[] }

function layoutTextNode(node: WbNode, width: number): TextLayout {
  const inner = Math.max(width - TEXT_PADDING * 2, HEADING.fontSize)
  const heading = clampLines(wrap(node.title || "Untitled", inner, HEADING.fontSize), MAX_TEXT_LINES, inner, HEADING.fontSize)
  const body = node.description
    ? clampLines(wrap(node.description, inner, BODY.fontSize), MAX_TEXT_LINES, inner, BODY.fontSize)
    : []
  return { heading, body }
}

function textNodeHeight({ heading, body }: TextLayout) {
  return (
    TEXT_PADDING * 2 +
    heading.length * HEADING.lineHeight +
    (body.length ? TEXT_GAP + body.length * BODY.lineHeight : 0)
  )
}

type Placed = { node: WbNode; box: Box; depth: number; text: TextLayout | null }

const finite = (value: number, limit: number) => (Number.isFinite(value) ? clamp(value, -limit, limit) : 0)

// A child's position is relative to its parent (as React Flow has it), so
// the absolute one is the sum up the chain. A parent that no longer exists
// is ignored, as the canvas does, and a cycle stops where it closes.
function placeNodes(nodes: WbNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const placed = new Map<string, Placed>()

  for (const node of nodes) {
    let x = finite(node.x, MAX_COORDINATE)
    let y = finite(node.y, MAX_COORDINATE)
    let depth = 0
    const seen = new Set([node.id])
    let parent = node.parentId ? byId.get(node.parentId) : undefined
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id)
      x += finite(parent.x, MAX_COORDINATE)
      y += finite(parent.y, MAX_COORDINATE)
      depth += 1
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }

    // DEFAULT_SIZE leaves one thing open, a text node's height, and that
    // follows its text: a stored height is only a floor.
    const fallback = DEFAULT_SIZE[node.kind]
    const width = clamp(node.width ?? fallback.width ?? 0, 1, MAX_NODE_SIZE)
    const text = node.kind === "text" ? layoutTextNode(node, width) : null
    const height = text
      ? Math.max(textNodeHeight(text), node.height ?? 0)
      : clamp(node.height ?? fallback.height ?? 0, 1, MAX_NODE_SIZE)

    placed.set(node.id, {
      node,
      box: { x: clamp(x, -MAX_COORDINATE, MAX_COORDINATE), y: clamp(y, -MAX_COORDINATE, MAX_COORDINATE), width, height },
      depth,
      text,
    })
  }
  return placed
}

// --- Nodes ----------------------------------------------------------------

// A pencil's stroke is a border color and too light to read as words, so
// text uses the theme's readable shade of it.
const wordColor = (color: ColorKey, uncolored: string, palette: Palette) =>
  color === "default" ? uncolored : palette.pencilText[color]

// The signature: two sheets peeking out behind a group that holds a
// whiteboard. Same geometry as the `sheet-stack` utility in globals.css. A
// group has no fill to hide the sheets behind, so each is drawn as only what
// sticks out: a band around the right and the bottom, whose inner edge
// follows the group's own border.
function sheetStack(box: Box, radius: number, edge: string, palette: Palette) {
  const left = box.x + 0.5
  const top = box.y + 0.5
  const right = box.x + box.width - 0.5
  const bottom = box.y + box.height - 0.5
  return [2, 1]
    .map((sheet) => {
      const offset = STACK_OFFSET * sheet
      // How far along a corner of the group the sheet's edge crosses it.
      const reach = Math.sqrt(radius * radius - (radius - offset) * (radius - offset))
      const corner = `A${radius} ${radius} 0 0`
      return (
        `<path d="M${n(right - radius + reach)} ${n(top + offset)}H${n(right + offset - radius)}${corner} 1 ${n(right + offset)} ${n(top + offset + radius)}` +
        `V${n(bottom + offset - radius)}${corner} 1 ${n(right + offset - radius)} ${n(bottom + offset)}` +
        `H${n(left + offset + radius)}${corner} 1 ${n(left + offset)} ${n(bottom + offset - radius)}` +
        `V${n(bottom - radius + reach)}${corner} 0 ${n(left + radius)} ${n(bottom)}` +
        `H${n(right - radius)}${corner} 0 ${n(right)} ${n(bottom - radius)}` +
        `V${n(top + radius)}${corner} 0 ${n(right - radius + reach)} ${n(top + offset)}Z" fill="${palette.sheet}" stroke="${edge}"/>`
      )
    })
    .join("")
}

// One of the whiteboard's icons (Lucide, ISC) drawn `size` wide with its
// top left corner at `x`, `y`. Nothing, for a name this version does not
// have. The data is ours (icon-data.ts), and it is escaped all the same.
function drawIcon(name: string | null, x: number, y: number, size: number, color: string) {
  const node = iconNode(name)
  if (!node) return ""
  const shapes = node
    .map(
      ([tag, attributes]) =>
        `<${tag} ${Object.entries(attributes)
          .map(([key, value]) => `${key}="${escapeXml(value)}"`)
          .join(" ")}/>`
    )
    .join("")
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 24)})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>`
}

const emojiText = (emoji: string, x: number, y: number, fontSize: number) =>
  `<text x="${n(x)}" y="${n(y + fontSize * 0.36)}" font-family="${EMOJI}" font-size="${fontSize}" text-anchor="middle">${escapeXml(emoji)}</text>`

const MARK_SIZE = 20
const MARK_GAP = 3

// A small square sheet centered on `at`: the frame of a badge.
function chip(at: Point, palette: Palette) {
  return `<rect x="${n(at.x - MARK_SIZE / 2 + 0.5)}" y="${n(at.y - MARK_SIZE / 2 + 0.5)}" width="${MARK_SIZE - 1}" height="${MARK_SIZE - 1}" rx="5" fill="${palette.sheet}" stroke="${palette.rule}"/>`
}

// The small square that says an object holds a document, centered on `at`.
function documentMark(at: Point, docType: "text" | "whiteboard", palette: Palette) {
  return chip(at, palette) + drawIcon(docType === "whiteboard" ? "workflow" : "file-text", at.x - 6, at.y - 6, 12, palette.graphite)
}

// What hangs on a node's corner, right to left from `at`: the document
// mark where it has always been, then the emoji, then the icon.
function cornerBadges({ node }: Placed, at: Point, palette: Palette) {
  let drawn = ""
  let x = at.x
  if (node.docId && node.docType) {
    drawn += documentMark({ x, y: at.y }, node.docType, palette)
    x -= MARK_SIZE + MARK_GAP
  }
  const emoji = singleEmoji(node.emoji)
  if (emoji) {
    drawn += chip({ x, y: at.y }, palette) + emojiText(emoji, x, at.y, 12)
    x -= MARK_SIZE + MARK_GAP
  }
  if (iconNode(node.icon))
    drawn += chip({ x, y: at.y }, palette) + drawIcon(node.icon, x - 6, at.y - 6, 12, wordColor(node.color, palette.ink, palette))
  return drawn
}

// How many badges that is, for whoever has to leave them room.
const badgeCount = (node: WbNode) =>
  (node.docId && node.docType ? 1 : 0) + (singleEmoji(node.emoji) ? 1 : 0) + (iconNode(node.icon) ? 1 : 0)

// A text node and a group wear them on the top right corner of their box.
const boxCorner = (box: Box): Point => ({ x: box.x + box.width, y: box.y })

function plainNode(placed: Placed, palette: Palette) {
  const { node, box } = placed
  const tinted = node.color !== "default"
  const stroke = tinted ? COLORS[node.color].stroke : mix(palette.ink, 55, palette.sheet)
  const fill = tinted ? mix(COLORS[node.color].stroke, 9, palette.sheet) : palette.sheet
  const geometry = shapeGeometry(node.shape, box)
  const area = geometry.text

  const inner = Math.max(area.width, PLAIN_TEXT.fontSize)
  // A node that stands for a repository folder says which one under its
  // name, as on the canvas: the name gives way first (two lines, not three),
  // and the path is one truncated line.
  const path = node.path ? truncate(node.path, inner, PATH_TEXT.fontSize, true) : null
  const pathRoom = path ? PATH_TEXT.lineHeight + PATH_TEXT.gap : 0
  const lines = clampLines(
    wrap(node.title || "Untitled", inner, PLAIN_TEXT.fontSize),
    linesThatFit(area.height - pathRoom, PLAIN_TEXT.lineHeight, path ? 2 : PLAIN_TEXT.maxLines),
    inner,
    PLAIN_TEXT.fontSize
  )
  const middle = area.x + area.width / 2
  const top = area.y + (area.height - lines.length * PLAIN_TEXT.lineHeight - pathRoom) / 2

  // The signature: a node that holds a whiteboard is a stack of sheets, each
  // one the node's own outline moved a step.
  const stack =
    node.docType === "whiteboard"
      ? [2, 1]
          .map((sheet) => {
            const behind = { ...box, x: box.x + geometry.stackStep.x * sheet, y: box.y + geometry.stackStep.y * sheet }
            return `<path d="${shapeGeometry(node.shape, behind).outline}" fill="${palette.sheet}" stroke="${tinted ? stroke : palette.blueline}" stroke-linejoin="round"/>`
          })
          .join("")
      : ""

  return (
    stack +
    `<path d="${geometry.outline}" fill="${fill}" stroke="${stroke}" stroke-linejoin="round"/>` +
    (geometry.detail ? `<path d="${geometry.detail}" fill="none" stroke="${stroke}"/>` : "") +
    textLines(lines, {
      x: middle,
      top,
      lineHeight: PLAIN_TEXT.lineHeight,
      fontSize: PLAIN_TEXT.fontSize,
      attributes: `text-anchor="middle" font-weight="500" fill="${palette.ink}"`,
    }) +
    (path
      ? textLines([path], {
          x: middle,
          top: top + lines.length * PLAIN_TEXT.lineHeight + PATH_TEXT.gap,
          lineHeight: PATH_TEXT.lineHeight,
          fontSize: PATH_TEXT.fontSize,
          attributes: `text-anchor="middle" font-family="${MONO}" letter-spacing="-0.25" fill="${palette.graphite}"`,
        })
      : "") +
    cornerBadges(placed, geometry.badge, palette)
  )
}

function textNode(placed: Placed, palette: Palette) {
  const { node, box, text } = placed
  if (!text) return ""
  const x = box.x + TEXT_PADDING
  const top = box.y + TEXT_PADDING
  return (
    textLines(text.heading, {
      x,
      top,
      ...HEADING,
      attributes: `font-weight="600" fill="${wordColor(node.color, palette.ink, palette)}"`,
    }) +
    textLines(text.body, {
      x,
      top: top + text.heading.length * HEADING.lineHeight + TEXT_GAP,
      ...BODY,
      attributes: `fill="${palette.graphite}"`,
    }) +
    cornerBadges(placed, boxCorner(box), palette)
  )
}

const CAPTION = { fontSize: 12, lineHeight: 16.5, gap: 6, maxLines: 2 }

const captionLines = (node: WbNode, width: number) =>
  node.title ? clampLines(wrap(node.title, width, CAPTION.fontSize), CAPTION.maxLines, width, CAPTION.fontSize) : []

// How far a media node's caption hangs below its box.
const captionReach = ({ node, box }: Placed) => {
  const lines = node.kind === "media" ? captionLines(node, box.width).length : 0
  return lines ? CAPTION.gap + lines * CAPTION.lineHeight : 0
}

// A picture or a video, as a frame that says which and carries its caption.
// The file itself is not in the image: see the top of this file.
function mediaNode(placed: Placed, palette: Palette) {
  const { node, box } = placed
  const frame = (offset: number, stroke: string) =>
    `<rect x="${n(box.x + offset + 0.5)}" y="${n(box.y + offset + 0.5)}" width="${n(box.width - 1)}" height="${n(box.height - 1)}" rx="6" fill="${palette.sheet}" stroke="${stroke}"/>`
  const icon = Math.min(24, box.width / 2, box.height / 2)
  const middle = center(box)

  return (
    (node.docType === "whiteboard" ? [2, 1].map((sheet) => frame(STACK_OFFSET * sheet, palette.blueline)).join("") : "") +
    frame(0, palette.rule) +
    drawIcon(node.mediaType === "video" ? "video" : "image", middle.x - icon / 2, middle.y - icon / 2, icon, palette.graphite) +
    textLines(captionLines(node, box.width), {
      x: middle.x,
      top: box.y + box.height + CAPTION.gap,
      lineHeight: CAPTION.lineHeight,
      fontSize: CAPTION.fontSize,
      attributes: `text-anchor="middle" fill="${palette.graphite}"`,
    }) +
    cornerBadges(placed, boxCorner(box), palette)
  )
}

const TAB = { fontSize: 10, height: 17, paddingX: 6, inset: 12, tracking: 0.25 }

function groupNode(placed: Placed, palette: Palette) {
  const { node, box } = placed
  const tinted = node.color !== "default"
  const pencil = tinted ? COLORS[node.color].stroke : ""
  const border = tinted ? mix(pencil, 60, palette.sheet) : palette.rule

  let tab = ""
  if (node.title) {
    // A tab on the top edge, like the label on a folder.
    // It stops short of the badges on the far corner.
    const badges = badgeCount(node)
    const room =
      box.width - TAB.inset * 2 - TAB.paddingX * 2 - (badges ? badges * (MARK_SIZE + MARK_GAP) - MARK_SIZE / 2 : 0)
    const label = truncate(node.title.toUpperCase(), Math.max(room, TAB.fontSize), TAB.fontSize, true)
    const width = textWidth(label, TAB.fontSize, true) + [...label].length * TAB.tracking + TAB.paddingX * 2
    const x = box.x + TAB.inset
    const y = box.y - TAB.height / 2
    tab =
      `<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${n(width - 1)}" height="${TAB.height - 1}" rx="5" fill="${palette.sheet}" stroke="${border}"/>` +
      `<text x="${n(x + TAB.paddingX)}" y="${n(y + TAB.height / 2 + TAB.fontSize * 0.35)}" font-family="${MONO}" font-size="${TAB.fontSize}" font-weight="500" letter-spacing="${TAB.tracking}" fill="${wordColor(node.color, palette.graphite, palette)}">${escapeXml(label)}</text>`
  }

  return (
    (node.docType === "whiteboard"
      ? sheetStack(box, 11, tinted ? pencil : palette.blueline, palette)
      : "") +
    // A frame, not a surface: what is inside it shows on the paper.
    `<rect x="${n(box.x + 0.5)}" y="${n(box.y + 0.5)}" width="${n(box.width - 1)}" height="${n(box.height - 1)}" rx="11" fill="none" stroke="${border}"/>` +
    tab +
    cornerBadges(placed, boxCorner(box), palette)
  )
}

// --- Edges ----------------------------------------------------------------

const isSide = (value: string | null): value is Side => SIDES.includes(value as Side)

const center = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

// Where an edge meets a node on one side: on the outline of a shaped node,
// which is not always the middle of the box's side.
function sidePoint({ node, box }: Placed, side: Side): Point {
  if (node.kind === "plain") return shapeGeometry(node.shape, box).anchors[side]
  const middle = center(box)
  return {
    x: middle.x + (NORMALS[side].x * box.width) / 2,
    y: middle.y + (NORMALS[side].y * box.height) / 2,
  }
}

// An edge drawn in the app remembers the sides it was attached to. One
// written by an import may not, so it takes the two sides that face each
// other.
function facingSides(source: Box, target: Box): [Side, Side] {
  const from = center(source)
  const to = center(target)
  if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y))
    return to.x >= from.x ? ["right", "left"] : ["left", "right"]
  return to.y >= from.y ? ["bottom", "top"] : ["top", "bottom"]
}

type Route = { path: string; label: Point; reach: Point[] }

// The same curve as React Flow's getBezierPath: each control point goes
// straight out of its side, further the further apart the ends are.
function splineRoute(from: Point, fromSide: Side, to: Point, toSide: Side): Route {
  const control = (at: Point, side: Side, other: Point): Point => {
    const normal = NORMALS[side]
    const distance = (other.x - at.x) * normal.x + (other.y - at.y) * normal.y
    const offset = distance >= 0 ? distance / 2 : 0.25 * 25 * Math.sqrt(-distance)
    return { x: at.x + normal.x * offset, y: at.y + normal.y * offset }
  }
  const c1 = control(from, fromSide, to)
  const c2 = control(to, toSide, from)
  const at = (t: number): Point => {
    const u = 1 - t
    const weights = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
    return {
      x: weights[0] * from.x + weights[1] * c1.x + weights[2] * c2.x + weights[3] * to.x,
      y: weights[0] * from.y + weights[1] * c1.y + weights[2] * c2.y + weights[3] * to.y,
    }
  }
  return {
    path: `M${n(from.x)} ${n(from.y)}C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(to.x)} ${n(to.y)}`,
    label: at(0.5),
    // A curve can swing outside the boxes it joins; these keep it in view.
    reach: [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map(at),
  }
}

// Right angles only. Each end leaves its node by a short straight run, and
// the two runs are joined by the fewest corners that do not double back.
function stepRoute(from: Point, fromSide: Side, to: Point, toSide: Side): Route {
  const a = { x: from.x + NORMALS[fromSide].x * STEP_GAP, y: from.y + NORMALS[fromSide].y * STEP_GAP }
  const b = { x: to.x + NORMALS[toSide].x * STEP_GAP, y: to.y + NORMALS[toSide].y * STEP_GAP }
  const fromNormal = NORMALS[fromSide]
  const toNormal = NORMALS[toSide]
  const horizontal = fromNormal.x !== 0

  let corners: Point[]
  if (horizontal !== (toNormal.x !== 0)) {
    // Perpendicular sides meet in one corner.
    corners = [horizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y }]
  } else if (fromSide === toSide) {
    // The same side twice: go around the one that sticks out further.
    const outer = horizontal
      ? fromNormal.x * Math.max(fromNormal.x * a.x, fromNormal.x * b.x)
      : fromNormal.y * Math.max(fromNormal.y * a.y, fromNormal.y * b.y)
    corners = horizontal
      ? [{ x: outer, y: a.y }, { x: outer, y: b.y }]
      : [{ x: a.x, y: outer }, { x: b.x, y: outer }]
  } else {
    // Opposite sides. When the target is ahead, turn halfway along; when it
    // is behind, cross over halfway between the two instead.
    const ahead = horizontal ? (b.x - a.x) * fromNormal.x >= 0 : (b.y - a.y) * fromNormal.y >= 0
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    corners =
      horizontal === ahead
        ? [{ x: middle.x, y: a.y }, { x: middle.x, y: b.y }]
        : [{ x: a.x, y: middle.y }, { x: b.x, y: middle.y }]
  }

  // Only the points where the line turns: a point that repeats the one
  // before it, or lies straight between its neighbors, says nothing.
  const points: Point[] = []
  for (const point of [from, a, ...corners, b, to]) {
    const last = points[points.length - 1]
    const before = points[points.length - 2]
    if (last && last.x === point.x && last.y === point.y) continue
    if (before && (last.x - before.x) * (point.y - last.y) === (last.y - before.y) * (point.x - last.x))
      points.pop()
    points.push(point)
  }

  // The label sits halfway along the line.
  const lengths = points.slice(1).map((point, i) => Math.abs(point.x - points[i].x) + Math.abs(point.y - points[i].y))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2
  let label = points[0]
  for (const [i, length] of lengths.entries()) {
    if (remaining <= length) {
      const t = length ? remaining / length : 0
      label = {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      }
      break
    }
    remaining -= length
  }

  return {
    path: points.map((point, i) => `${i ? "L" : "M"}${n(point.x)} ${n(point.y)}`).join(""),
    label,
    reach: points,
  }
}

// A closed arrowhead with its tip on the node's side, pointing in. Drawn as
// a shape, not an SVG marker: not every image renderer turns markers to
// follow the line.
function arrowhead(tip: Point, side: Side, color: string) {
  const out = NORMALS[side]
  const across = { x: -out.y, y: out.x }
  const corner = (sign: number) =>
    `${n(tip.x + out.x * 6 + across.x * 4.25 * sign)},${n(tip.y + out.y * 6 + across.y * 4.25 * sign)}`
  return `<polygon points="${n(tip.x)},${n(tip.y)} ${corner(1)} ${corner(-1)}" fill="${color}" stroke="${color}" stroke-linejoin="round"/>`
}

const PILL = { fontSize: 11, height: 20, paddingX: 6, gap: 4, icon: 12, emoji: 14 }

type DrawnEdge = { line: string; label: string; reach: Box[] }

function drawEdge(edge: WbEdge, placed: Map<string, Placed>, palette: Palette): DrawnEdge | null {
  const source = placed.get(edge.source)
  const target = placed.get(edge.target)
  if (!source || !target) return null

  const facing = facingSides(source.box, target.box)
  const fromSide = isSide(edge.sourceHandle) ? edge.sourceHandle : facing[0]
  const toSide = isSide(edge.targetHandle) ? edge.targetHandle : facing[1]
  const from = sidePoint(source, fromSide)
  const to = sidePoint(target, toSide)
  const route = (edge.shape === "step" ? stepRoute : splineRoute)(from, fromSide, to, toSide)

  // Default edges are graphite, quieter than the nodes they join.
  const color = edge.color === "default" ? palette.graphite : COLORS[edge.color].stroke
  const dotted = edge.stroke === "dotted" ? ' stroke-dasharray="2 6" stroke-linecap="round"' : ""
  const line =
    `<path d="${route.path}" fill="none" stroke="${color}" stroke-width="1.5"${dotted}/>` +
    (edge.direction === "forward" || edge.direction === "both" ? arrowhead(to, toSide, color) : "") +
    (edge.direction === "reverse" || edge.direction === "both" ? arrowhead(from, fromSide, color) : "")

  // The label and the document mark share the middle of the line, side by
  // side, as they do on the canvas. Inside the label: the icon, the emoji,
  // then the words, whichever of them there are.
  const text = edge.label ? truncate(edge.label.replace(/\s+/g, " "), 240, PILL.fontSize, true) : ""
  // Whoever calls this read the document defensively (schema.ts); an emoji
  // is checked again all the same, since this is where it becomes an image.
  const emoji = singleEmoji(edge.emoji)
  const parts = [
    iconNode(edge.icon) ? PILL.icon : 0,
    emoji ? PILL.emoji : 0,
    text ? textWidth(text, PILL.fontSize, true) : 0,
  ].filter(Boolean)
  const pillWidth = parts.length
    ? parts.reduce((sum, part) => sum + part, 0) + (parts.length - 1) * PILL.gap + PILL.paddingX * 2
    : 0
  const markWidth = edge.docId && edge.docType ? MARK_SIZE : 0
  const total = pillWidth + markWidth + (pillWidth && markWidth ? 4 : 0)
  const left = route.label.x - total / 2

  let label = ""
  if (pillWidth) {
    const y = route.label.y - PILL.height / 2
    label += `<rect x="${n(left + 0.5)}" y="${n(y + 0.5)}" width="${n(pillWidth - 1)}" height="${PILL.height - 1}" rx="5" fill="${palette.sheet}" stroke="${palette.rule}"/>`
    let x = left + PILL.paddingX
    if (iconNode(edge.icon)) {
      label += drawIcon(edge.icon, x, route.label.y - PILL.icon / 2, PILL.icon, wordColor(edge.color, palette.graphite, palette))
      x += PILL.icon + PILL.gap
    }
    if (emoji) {
      label += emojiText(emoji, x + PILL.emoji / 2, route.label.y, PILL.fontSize)
      x += PILL.emoji + PILL.gap
    }
    if (text)
      label += `<text x="${n(x)}" y="${n(route.label.y + PILL.fontSize * 0.35)}" font-family="${MONO}" font-size="${PILL.fontSize}" fill="${palette.graphite}">${escapeXml(text)}</text>`
  }
  if (edge.docId && edge.docType)
    label += documentMark({ x: left + total - MARK_SIZE / 2, y: route.label.y }, edge.docType, palette)

  const reach = route.reach.map((point) => ({ x: point.x - 6, y: point.y - 6, width: 12, height: 12 }))
  if (total) reach.push({ x: left, y: route.label.y - PILL.height / 2, width: total, height: PILL.height })
  return { line, label, reach }
}

// --- The image ------------------------------------------------------------

function frame(
  view: Box,
  body: string,
  { palette, title, caption, host }: { palette: Palette; title: string; caption: string; host: string }
) {
  // An image wider than MAX_IMAGE_SIDE is scaled down, not cut off.
  const scale = Math.min(1, MAX_IMAGE_SIDE / view.width, MAX_IMAGE_SIDE / view.height)
  const label = escapeXml(title)
  const bottom = view.y + view.height - 12
  const mark = truncate(host, 220, 11)
  const captionRoom = view.width - 40 - textWidth(mark, 11) - 24

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(view.width * scale)}" height="${n(view.height * scale)}" viewBox="${n(view.x)} ${n(view.y)} ${n(view.width)} ${n(view.height)}" role="img" aria-label="${label}" font-family="${SANS}">` +
    `<title>${label}</title>` +
    `<rect x="${n(view.x + 0.5)}" y="${n(view.y + 0.5)}" width="${n(view.width - 1)}" height="${n(view.height - 1)}" rx="12" fill="${palette.paper}" stroke="${palette.rule}"/>` +
    body +
    (caption
      ? `<text x="${n(view.x + 20)}" y="${n(bottom)}" font-size="11" fill="${palette.graphite}">${escapeXml(truncate(caption, captionRoom, 11))}</text>`
      : "") +
    `<text x="${n(view.x + view.width - 20)}" y="${n(bottom)}" font-size="11" text-anchor="end" fill="${palette.graphite}">${escapeXml(mark)}</text>` +
    `</svg>`
  )
}

// A small card with one sentence on it: an empty whiteboard, or a diagram
// that cannot be shown.
export function renderMessageSvg({
  message,
  theme,
  host,
  title = message,
}: {
  message: string
  theme: SvgTheme
  host: string
  title?: string
}) {
  const palette = PALETTES[theme]
  const view = { x: 0, y: 0, width: 420, height: 160 }
  const line = truncate(message, view.width - 48, 14)
  const body = `<text x="${view.width / 2}" y="${view.height / 2}" font-size="14" font-weight="500" text-anchor="middle" fill="${palette.graphite}">${escapeXml(line)}</text>`
  return frame(view, body, { palette, title, caption: "", host })
}

export function renderWhiteboardSvg({
  nodes,
  edges,
  theme,
  title,
  host = "subcanvas.app",
}: {
  nodes: WbNode[]
  edges: WbEdge[]
  theme: SvgTheme
  title: string
  // Shown in the corner. A self-hosted server passes its own.
  host?: string
}) {
  if (!nodes.length)
    return renderMessageSvg({ message: "Empty whiteboard", theme, host, title: title || "Empty whiteboard" })

  const palette = PALETTES[theme]
  const placed = placeNodes(nodes.slice(0, MAX_OBJECTS))
  const all = [...placed.values()]
  const drawn = edges.slice(0, MAX_OBJECTS).flatMap((edge) => drawEdge(edge, placed, palette) ?? [])

  // Everything that must be in view: each node with whatever hangs off it
  // (the sheets behind, the mark and the tab above, a caption below), and
  // each edge.
  const extents = [
    ...all.map((placed) => ({
      x: placed.box.x,
      y: placed.box.y - MARK_SIZE / 2,
      width: placed.box.width + STACK_REACH,
      height: placed.box.height + MARK_SIZE / 2 + Math.max(STACK_REACH, captionReach(placed)),
    })),
    ...drawn.flatMap((edge) => edge.reach),
  ]
  const left = Math.min(...extents.map((box) => box.x))
  const top = Math.min(...extents.map((box) => box.y))
  const right = Math.max(...extents.map((box) => box.x + box.width))
  const bottom = Math.max(...extents.map((box) => box.y + box.height))
  // Never narrower than the caption and the mark need.
  const width = Math.max(right - left + PADDING * 2, 320)
  const view = {
    x: Math.floor(left - PADDING - (width - (right - left + PADDING * 2)) / 2),
    y: Math.floor(top - PADDING),
    width: Math.ceil(width),
    height: Math.ceil(bottom - top + PADDING * 2 + FOOTER),
  }

  // Back to front, as the canvas stacks them: groups (outer ones first),
  // then lines, then nodes, then the labels that ride on the lines.
  const groups = all.filter(({ node }) => node.kind === "group").sort((a, b) => a.depth - b.depth)
  const others = all.filter(({ node }) => node.kind !== "group")
  const draw = { plain: plainNode, text: textNode, media: mediaNode, group: groupNode }
  const body =
    groups.map((group) => groupNode(group, palette)).join("") +
    drawn.map((edge) => edge.line).join("") +
    others.map((other) => draw[other.node.kind](other, palette)).join("") +
    drawn.map((edge) => edge.label).join("")

  return frame(view, body, { palette, title: title || "Whiteboard", caption: title, host })
}
