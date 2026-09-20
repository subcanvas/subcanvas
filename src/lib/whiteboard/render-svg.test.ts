import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom"
import { describe, expect, it } from "vitest"

import { renderMessageSvg, renderWhiteboardSvg } from "./render-svg"
import type { WbEdge, WbNode } from "./schema"
import { NODE_SHAPES, shapeGeometry } from "./shapes"

const node = (fields: Partial<WbNode> & { id: string }): WbNode => ({
  kind: "plain",
  x: 0,
  y: 0,
  width: null,
  height: null,
  parentId: null,
  title: fields.id,
  description: "",
  color: "default",
  docId: null,
  docType: null,
  openMode: "panel",
  path: null,
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

const edge = (fields: Partial<WbEdge> & { id: string; source: string; target: string }): WbEdge => ({
  sourceHandle: null,
  targetHandle: null,
  shape: "spline",
  stroke: "solid",
  direction: "forward",
  color: "default",
  label: "",
  icon: null,
  emoji: null,
  docId: null,
  docType: null,
  openMode: "panel",
  ...fields,
})

// Fails the test on anything that is not well-formed XML, which is what a
// browser does to an image: one stray "<" and it shows nothing.
function parse(svg: string) {
  const document = new DOMParser({
    onError: (level, message) => {
      throw new Error(`${level}: ${message}`)
    },
  }).parseFromString(svg, "image/svg+xml")
  return document.documentElement!
}

const all = (root: XmlElement, tag: string) => Array.from(root.getElementsByTagName(tag))

// The lines of the edges: the only paths that are stroked and never filled
// at that width. Node outlines are paths too.
const edgeLines = (root: XmlElement) =>
  all(root, "path").filter((path) => path.getAttribute("stroke-width") === "1.5")

const render = (nodes: WbNode[], edges: WbEdge[] = [], theme: "light" | "dark" = "light") =>
  renderWhiteboardSvg({ nodes, edges, theme, title: "Test board" })

const two = [node({ id: "a" }), node({ id: "b", x: 400 })]

describe("renderWhiteboardSvg", () => {
  it("escapes a hostile title everywhere it appears", () => {
    const hostile = `</text><script>alert("x")</script> & 'co' <img onerror=x>`
    const svg = renderWhiteboardSvg({
      nodes: [
        node({ id: "a", title: hostile }),
        node({ id: "t", kind: "text", y: 200, title: hostile, description: hostile }),
        node({ id: "g", kind: "group", y: 400, title: hostile }),
      ],
      edges: [edge({ id: "e", source: "a", target: "t", label: hostile })],
      theme: "light",
      title: hostile,
      host: hostile,
    })
    const root = parse(svg)
    expect(svg).not.toMatch(/<script|<img|onerror="/i)
    expect(all(root, "script")).toHaveLength(0)
    expect(root.getAttribute("aria-label")).toBe(hostile)
    expect(all(root, "title")[0].textContent).toBe(hostile)
  })

  it("drops characters that XML cannot hold", () => {
    const svg = render([node({ id: "a", title: "be\u0000fo\u0008re \uD800 after" })])
    expect(parse(svg).textContent).toContain("before  after")
  })

  it("never emits anything an image must not carry", () => {
    const svg = render(
      [node({ id: "a", docId: "d", docType: "whiteboard" }), node({ id: "b", x: 300, docId: "d2", docType: "text" })],
      [edge({ id: "e", source: "a", target: "b", label: "calls", docId: "d3", docType: "text" })]
    )
    expect(svg).not.toMatch(/<script|<foreignObject|<style|<image|<use|href=|url\(|@import/i)
  })

  it("places a child relative to its group, and the group beneath it", () => {
    const svg = render([
      node({ id: "child", parentId: "group", x: 40, y: 50, width: 100, height: 40 }),
      node({ id: "group", kind: "group", x: 1000, y: 2000, title: "Backend" }),
    ])
    const root = parse(svg)
    // The child's outline starts on its top edge, after the corner's radius.
    const child = all(root, "path").find((path) => path.getAttribute("d")!.startsWith("M1048 2050.5H"))!
    const group = all(root, "rect").find((rect) => rect.getAttribute("width") === "359")!
    // Beneath: earlier in the document.
    const order = Array.from(root.childNodes)
    expect(order.indexOf(child)).toBeGreaterThan(order.indexOf(group))
    expect(order.indexOf(group)).toBeGreaterThan(-1)
  })

  it("survives a parent cycle and a missing parent", () => {
    const svg = render([
      node({ id: "a", parentId: "b", x: 10 }),
      node({ id: "b", parentId: "a", x: 10 }),
      node({ id: "c", parentId: "gone", x: 10 }),
    ])
    expect(all(parse(svg), "text").length).toBeGreaterThanOrEqual(3)
  })

  it("renders a card for an empty whiteboard", () => {
    const root = parse(render([]))
    expect(root.textContent).toContain("Empty whiteboard")
    expect(root.getAttribute("viewBox")).toBe("0 0 420 160")
  })

  it("uses each theme's colors", () => {
    const light = render(two, [], "light")
    const dark = render(two, [], "dark")
    parse(dark)
    expect(light).toContain('fill="#f4f6fa"')
    expect(light).toContain('fill="#10162f"')
    expect(dark).toContain('fill="#171717"')
    expect(dark).toContain('fill="#ededed"')
    expect(dark).not.toContain("#f4f6fa")
  })

  it("mixes a colored node's fill from its stroke and the sheet", () => {
    const svg = render([node({ id: "a", color: "blue" })])
    // 9% of #0b7fe0 over white.
    expect(svg).toContain('fill="#e9f3fc" stroke="#0b7fe0"')
  })

  it("draws an edge between the facing sides of two nodes", () => {
    const paths = edgeLines(parse(render(two, [edge({ id: "e", source: "a", target: "b" })])))
    expect(paths).toHaveLength(1)
    // From the middle of a's right side to the middle of b's left side.
    expect(paths[0].getAttribute("d")).toMatch(/^M160 32C.* 400 32$/)
  })

  it("attaches to the sides the edge remembers", () => {
    const svg = render(two, [edge({ id: "e", source: "a", target: "b", sourceHandle: "bottom", targetHandle: "top" })])
    expect(edgeLines(parse(svg))[0].getAttribute("d")).toMatch(/^M80 64C.* 480 0$/)
  })

  it("draws a step edge with right angles only", () => {
    const svg = render(
      [node({ id: "a" }), node({ id: "b", x: 400, y: 300 })],
      [edge({ id: "e", source: "a", target: "b", shape: "step" })]
    )
    expect(edgeLines(parse(svg))[0].getAttribute("d")).toBe("M160 32L280 32L280 332L400 332")
  })

  it("keeps a step edge square whichever sides it joins", () => {
    const sides = ["top", "right", "bottom", "left"]
    for (const sourceHandle of sides)
      for (const targetHandle of sides)
        for (const [x, y] of [[400, 300], [-400, 40], [30, -300], [0, 84]]) {
          const svg = render(
            [node({ id: "a" }), node({ id: "b", x, y })],
            [edge({ id: "e", source: "a", target: "b", shape: "step", sourceHandle, targetHandle })]
          )
          const points = edgeLines(parse(svg))[0]
            .getAttribute("d")!
            .split(/[ML]/)
            .filter(Boolean)
            .map((pair) => pair.split(" ").map(Number))
          expect(points.length).toBeGreaterThanOrEqual(2)
          for (const [i, [px, py]] of points.entries())
            if (i) expect(px === points[i - 1][0] || py === points[i - 1][1]).toBe(true)
        }
  })

  it("skips an edge whose node is gone", () => {
    expect(edgeLines(parse(render(two, [edge({ id: "e", source: "a", target: "gone" })])))).toHaveLength(0)
  })

  it("dots the line only when the edge is dotted", () => {
    const line = (stroke: WbEdge["stroke"]) =>
      edgeLines(parse(render(two, [edge({ id: "e", source: "a", target: "b", stroke })])))[0]
    expect(line("dotted").getAttribute("stroke-dasharray")).toBe("2 6")
    expect(line("solid").hasAttribute("stroke-dasharray")).toBe(false)
  })

  it("puts an arrowhead on each end the direction names", () => {
    const heads = (direction: WbEdge["direction"]) =>
      all(parse(render(two, [edge({ id: "e", source: "a", target: "b", direction })])), "polygon").map(
        (head) => head.getAttribute("points")!.split(" ")[0]
      )
    expect(heads("none")).toEqual([])
    expect(heads("forward")).toEqual(["400,32"])
    expect(heads("reverse")).toEqual(["160,32"])
    expect(heads("both")).toEqual(["400,32", "160,32"])
  })

  it("labels an edge on a pill", () => {
    const root = parse(render(two, [edge({ id: "e", source: "a", target: "b", label: "reads from" })]))
    expect(all(root, "text").some((text) => text.textContent === "reads from")).toBe(true)
  })

  it("stacks sheets behind a node that holds a whiteboard, and only there", () => {
    const drawn = (docType: WbNode["docType"]) => {
      const root = parse(render([node({ id: "a", docId: docType && "d", docType })]))
      // Not the ones inside the mark's icon.
      const direct = (tag: string) => all(root, tag).filter((shape) => shape.parentNode?.nodeName === "svg").length
      return { rects: direct("rect"), paths: direct("path") }
    }
    // The background, and the node's outline; then the document mark; then
    // two sheets.
    expect(drawn(null)).toEqual({ rects: 1, paths: 1 })
    expect(drawn("text")).toEqual({ rects: 2, paths: 1 })
    expect(drawn("whiteboard")).toEqual({ rects: 2, paths: 3 })
  })

  it("draws every shape, alone and as a stack of sheets, as a standalone image", () => {
    for (const shape of NODE_SHAPES) {
      const svg = render([
        node({ id: "plain", shape, width: 180, height: 110, color: "blue" }),
        node({ id: "stack", shape, x: 300, width: 180, height: 110, docId: "d", docType: "whiteboard" }),
      ])
      const root = parse(svg)
      const outlines = all(root, "path").filter((path) => path.parentNode?.nodeName === "svg")
      // The outline of each node, and two sheets behind the second.
      expect(outlines.length, shape).toBeGreaterThanOrEqual(4)
      expect(outlines[0].getAttribute("d"), shape).toBe(shapeGeometry(shape, { x: 0, y: 0, width: 180, height: 110 }).outline)
      expect(svg, shape).not.toMatch(/NaN|undefined|<script|<foreignObject|<style|<image|<use|href=|url\(|@import/i)
    }
  })

  it("keeps a title inside the safe area of its shape", () => {
    const root = parse(render([node({ id: "a", shape: "diamond", width: 184, height: 112, title: "Should we cache this response or not?" })]))
    const { text } = shapeGeometry("diamond", { x: 0, y: 0, width: 184, height: 112 })
    const lines = all(root, "text").filter((line) => line.getAttribute("text-anchor") === "middle")
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(Number(line.getAttribute("x"))).toBe(92)
      const baseline = Number(line.getAttribute("y"))
      expect(baseline).toBeGreaterThan(text.y)
      expect(baseline).toBeLessThan(text.y + text.height)
    }
  })

  it("attaches an edge to the outline of a shape, not to its box", () => {
    const svg = render(
      [
        node({ id: "a", shape: "parallelogram", width: 200, height: 100 }),
        node({ id: "b", shape: "cloud", x: 400, width: 200, height: 100 }),
      ],
      [edge({ id: "e", source: "a", target: "b", sourceHandle: "right", targetHandle: "left" })]
    )
    const { left } = shapeGeometry("cloud", { x: 400, y: 0, width: 200, height: 100 }).anchors
    expect(left.x).toBeGreaterThan(400)
    const d = edgeLines(parse(svg))[0].getAttribute("d")!
    // Half the lean in from the parallelogram's right side.
    expect(d.startsWith("M180 50C")).toBe(true)
    expect(d.endsWith(` ${Math.round(left.x * 100) / 100} 50`)).toBe(true)
  })

  it("draws a node's icon and emoji as badges, beside the document mark", () => {
    const badges = (fields: Partial<WbNode>) => {
      const root = parse(render([node({ id: "a", ...fields })]))
      return {
        chips: all(root, "rect").filter((rect) => rect.getAttribute("width") === "19" && rect.parentNode?.nodeName === "svg"),
        icons: all(root, "g").filter((group) => group.getAttribute("stroke-linecap") === "round").length,
        emoji: all(root, "text").filter((text) => text.getAttribute("font-family")?.includes("Emoji")).map((text) => text.textContent),
      }
    }
    expect(badges({})).toMatchObject({ chips: [], icons: 0, emoji: [] })
    expect(badges({ icon: "database" })).toMatchObject({ icons: 1, emoji: [] })
    expect(badges({ emoji: "🐘" })).toMatchObject({ icons: 0, emoji: ["🐘"] })

    const three = badges({ icon: "database", emoji: "👨‍👩‍👧‍👦", docId: "d", docType: "text" })
    expect(three).toMatchObject({ icons: 2, emoji: ["👨‍👩‍👧‍👦"] })
    // Side by side, never on top of each other; the mark is the last one.
    const lefts = three.chips.map((chip) => Number(chip.getAttribute("x"))).sort((a, b) => a - b)
    expect(lefts).toHaveLength(3)
    expect(lefts[1] - lefts[0]).toBeGreaterThanOrEqual(20)
    expect(lefts[2] - lefts[1]).toBeGreaterThanOrEqual(20)

    for (const kind of ["text", "group"] as const)
      expect(parse(render([node({ id: "a", kind, icon: "server", emoji: "🚀" })])).textContent).toContain("🚀")
  })

  it("ignores an icon it does not know and an emoji that is not one", () => {
    const hostile = `"/><script>alert(1)</script>`
    const svg = render(
      [node({ id: "a", icon: hostile, emoji: hostile }), node({ id: "b", x: 400, icon: "constructor", emoji: "not an emoji" })],
      [edge({ id: "e", source: "a", target: "b", icon: hostile, emoji: hostile })]
    )
    const root = parse(svg)
    expect(all(root, "script")).toHaveLength(0)
    expect(svg).not.toContain("alert")
    expect(svg).not.toContain("not an emoji")
    // No badge, and no pill on the edge: there is nothing to put in either.
    expect(all(root, "rect")).toHaveLength(1)
  })

  it("gives an edge a pill for an icon or an emoji alone, and puts them before the words", () => {
    const pill = (fields: Partial<WbEdge>) => {
      const root = parse(render(two, [edge({ id: "e", source: "a", target: "b", ...fields })]))
      return all(root, "rect").filter((rect) => rect.getAttribute("height") === "19" && rect.getAttribute("width") !== "19")
    }
    expect(pill({})).toHaveLength(0)
    expect(pill({ icon: "lock" })).toHaveLength(1)
    expect(pill({ emoji: "🔒" })).toHaveLength(1)

    const root = parse(render(two, [edge({ id: "e", source: "a", target: "b", icon: "lock", emoji: "🔒", label: "TLS" })]))
    const icon = all(root, "g").find((group) => group.getAttribute("stroke-linecap") === "round")!
    const x = (element: XmlElement) => Number(/translate\(([-\d.]+)/.exec(element.getAttribute("transform") ?? "")?.[1] ?? element.getAttribute("x"))
    const emoji = all(root, "text").find((text) => text.textContent === "🔒")!
    const words = all(root, "text").find((text) => text.textContent === "TLS")!
    expect(x(icon)).toBeLessThan(x(emoji))
    expect(x(emoji)).toBeLessThan(x(words))
    // All of it inside the pill.
    const [frame] = pill({ icon: "lock", emoji: "🔒", label: "TLS" })
    expect(x(icon)).toBeGreaterThan(Number(frame.getAttribute("x")))
  })

  it("draws a group as a frame with nothing in it", () => {
    const root = parse(render([node({ id: "g", kind: "group", color: "purple", docId: "d", docType: "whiteboard" })]))
    const frame = all(root, "rect").find((rect) => rect.getAttribute("width") === "359")!
    expect(frame.getAttribute("fill")).toBe("none")
    // The two sheets behind it are bands around its right and bottom.
    expect(all(root, "path").filter((path) => path.parentNode?.nodeName === "svg")).toHaveLength(2)
  })

  it("keeps a long title inside its box", () => {
    const root = parse(render([node({ id: "a", title: "An unreasonably long title ".repeat(20) })]))
    const lines = all(root, "text").filter((text) => text.getAttribute("text-anchor") === "middle")
    expect(lines).toHaveLength(2)
    expect(lines[1].textContent!.endsWith("…")).toBe(true)
    for (const line of lines) expect(line.textContent!.length).toBeLessThan(30)
  })

  it("fits the view box around everything, with room to spare", () => {
    const root = parse(render([node({ id: "a", x: -500, y: -300 }), node({ id: "b", x: 900, y: 700 })]))
    const [x, y, width, height] = root.getAttribute("viewBox")!.split(" ").map(Number)
    expect(x).toBeLessThan(-500)
    expect(y).toBeLessThan(-300)
    expect(x + width).toBeGreaterThan(900 + 160)
    expect(y + height).toBeGreaterThan(700 + 64)
  })

  it("caps the size of an absurd whiteboard", () => {
    const root = parse(render([node({ id: "a" }), node({ id: "b", x: 1e12, y: Number.NaN, width: 1e9 })]))
    expect(Number(root.getAttribute("width"))).toBeLessThanOrEqual(4000)
    expect(Number(root.getAttribute("height"))).toBeLessThanOrEqual(4000)
  })

  it("shows the host it was given in the corner", () => {
    const svg = renderWhiteboardSvg({ nodes: two, edges: [], theme: "light", title: "T", host: "draw.example.org" })
    expect(parse(svg).textContent).toContain("draw.example.org")
    expect(parse(render(two)).textContent).toContain("subcanvas.app")
  })
})

describe("media nodes", () => {
  const file =
    "00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000b1/00000000-0000-4000-8000-0000000000d1/00000000-0000-4000-8000-0000000000f1.png"
  const picture = node({
    id: "m", kind: "media", width: 320, height: 200, title: "The <login> page", mediaPath: file, mediaType: "image",
  })

  it("draws a frame with the caption under it, and never the file", () => {
    const svg = render([picture, node({ ...picture, id: "v", x: 400, mediaType: "video", mediaPath: file.replace(".png", ".mp4") })])
    expect(svg).not.toMatch(/<image|<use|href=|url\(|00000000-0000-4000/i)
    const root = parse(svg)
    expect(all(root, "rect").filter((rect) => rect.getAttribute("width") === "319")).toHaveLength(2)
    const caption = all(root, "text").find((text) => text.textContent === "The <login> page")!
    expect(Number(caption.getAttribute("y"))).toBeGreaterThan(200)
  })

  it("makes room for the caption at the bottom of the image", () => {
    const height = (nodes: WbNode[]) => Number(parse(render(nodes)).getAttribute("viewBox")!.split(" ")[3])
    expect(height([picture])).toBeGreaterThan(height([{ ...picture, title: "" }]))
  })

  it("ends an arrow on the frame", () => {
    const svg = render([picture, node({ id: "b", x: 500, y: 68 })], [edge({ id: "e", source: "b", target: "m", sourceHandle: "left", targetHandle: "right" })])
    expect(svg).toContain("320 100")
  })
})

describe("renderMessageSvg", () => {
  it("renders one sentence in either theme", () => {
    for (const theme of ["light", "dark"] as const) {
      const root = parse(renderMessageSvg({ message: "This diagram is private or does not exist", theme, host: "subcanvas.app" }))
      expect(root.textContent).toContain("This diagram is private or does not exist")
    }
  })
})

describe("repository nodes", () => {
  it("draws the folder path under the name, escaped, and only when there is one", () => {
    const svg = renderWhiteboardSvg({
      nodes: [
        node({ id: "a", title: "Payments", width: 200, height: 64, path: "services/<payments>" }),
        node({ id: "b", title: "Plain", width: 160, height: 64, x: 300 }),
      ],
      edges: [],
      theme: "dark",
      title: "System design",
    })
    expect(svg).toContain("services/&lt;payments&gt;")
    expect(svg.match(/font-family="ui-monospace/g)?.length).toBe(1)
    expect(new DOMParser().parseFromString(svg, "image/svg+xml").documentElement?.nodeName).toBe("svg")
  })
})
