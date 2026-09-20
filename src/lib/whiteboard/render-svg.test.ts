import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom"
import { describe, expect, it } from "vitest"

import { renderMessageSvg, renderWhiteboardSvg } from "./render-svg"
import type { WbEdge, WbNode } from "./schema"

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
    const rects = all(parse(svg), "rect")
    const child = rects.find((rect) => rect.getAttribute("width") === "99" && rect.getAttribute("height") === "39")!
    expect(child.getAttribute("x")).toBe("1040.5")
    expect(child.getAttribute("y")).toBe("2050.5")
    const group = rects.find((rect) => rect.getAttribute("width") === "359")!
    expect(rects.indexOf(group)).toBeLessThan(rects.indexOf(child))
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
    const paths = all(parse(render(two, [edge({ id: "e", source: "a", target: "b" })])), "path")
    expect(paths).toHaveLength(1)
    // From the middle of a's right side to the middle of b's left side.
    expect(paths[0].getAttribute("d")).toMatch(/^M160 32C.* 400 32$/)
  })

  it("attaches to the sides the edge remembers", () => {
    const svg = render(two, [edge({ id: "e", source: "a", target: "b", sourceHandle: "bottom", targetHandle: "top" })])
    expect(all(parse(svg), "path")[0].getAttribute("d")).toMatch(/^M80 64C.* 480 0$/)
  })

  it("draws a step edge with right angles only", () => {
    const svg = render(
      [node({ id: "a" }), node({ id: "b", x: 400, y: 300 })],
      [edge({ id: "e", source: "a", target: "b", shape: "step" })]
    )
    expect(all(parse(svg), "path")[0].getAttribute("d")).toBe("M160 32L280 32L280 332L400 332")
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
          const points = all(parse(svg), "path")[0]
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
    expect(all(parse(render(two, [edge({ id: "e", source: "a", target: "gone" })])), "path")).toHaveLength(0)
  })

  it("dots the line only when the edge is dotted", () => {
    const line = (stroke: WbEdge["stroke"]) =>
      all(parse(render(two, [edge({ id: "e", source: "a", target: "b", stroke })])), "path")[0]
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
    const rects = (docType: WbNode["docType"]) =>
      all(parse(render([node({ id: "a", docId: docType && "d", docType })])), "rect").filter(
        // Not the ones inside the mark's icon.
        (rect) => rect.parentNode?.nodeName === "svg"
      ).length
    // The background and the box; then the document mark; then two sheets.
    expect(rects(null)).toBe(2)
    expect(rects("text")).toBe(3)
    expect(rects("whiteboard")).toBe(5)
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
