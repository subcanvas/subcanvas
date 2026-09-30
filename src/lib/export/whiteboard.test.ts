import { describe, expect, it } from "vitest"
import * as Y from "yjs"

import { edgesMap, nodesMap, toYMap } from "@/lib/whiteboard/schema"

import { readWhiteboard, whiteboardFile, whiteboardSvg } from "./whiteboard"

const PHOTO = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.png"

function board() {
  const doc = new Y.Doc()
  nodesMap(doc).set("a", toYMap({ kind: "plain", x: 0, y: 0, width: 160, height: 64, title: "Payments" }))
  nodesMap(doc).set("b", toYMap({ kind: "plain", x: 300, y: 0, width: 160, height: 64, title: "Ledger <main>", color: "blue" }))
  nodesMap(doc).set("m", toYMap({ kind: "media", x: 0, y: 200, width: 320, height: 240, title: "Office", mediaPath: PHOTO }))
  edgesMap(doc).set("ab", toYMap({ source: "a", target: "b", label: "pays", direction: "forward" }))
  // Its end was deleted by someone else: the canvas does not draw it.
  edgesMap(doc).set("dangling", toYMap({ source: "a", target: "gone" }))
  return doc
}

describe("a whiteboard in an export", () => {
  it("is read as the canvas draws it, without arrows that lead nowhere", () => {
    const { nodes, edges } = readWhiteboard(board())
    expect(nodes.map((node) => node.id).sort()).toEqual(["a", "b", "m"])
    expect(edges.map((edge) => edge.id)).toEqual(["ab"])
  })

  it("is drawn as the embed's picture, light, standalone, and with its text escaped", () => {
    const svg = whiteboardSvg(readWhiteboard(board()), "Architecture", "app.test")
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("Payments")
    expect(svg).toContain("Ledger &lt;main&gt;")
    expect(svg).toContain("pays")
    expect(svg).toContain("app.test")
    // The light paper, and nothing that loads or runs: a picture is a frame.
    expect(svg).toContain("#f4f6fa")
    expect(svg).not.toMatch(/<image|<script|<foreignObject|href=/)
  })

  it("writes every field of every object, so nothing depends on knowing the defaults", () => {
    const file = whiteboardFile({
      id: "board",
      title: "Architecture",
      contents: readWhiteboard(board()),
      held: () => ({ title: null, path: null, url: null }),
      media: (path) => ({ path: "Architecture/Office.png", url: `https://app.test/api/media/${path}` }),
    })
    const payments = file.nodes.find((node) => node.id === "a")!
    expect(Object.keys(payments).sort()).toEqual(
      ["id", "kind", "title", "description", "x", "y", "width", "height", "group", "color", "shape", "icon", "emoji", "open_mode", "repository_path", "holds", "media"].sort()
    )
    expect(payments).toMatchObject({ color: "default", shape: "rectangle", group: null, holds: null, media: null })
    expect(file.nodes.find((node) => node.id === "m")!.media).toMatchObject({ type: "image", path: "Architecture/Office.png" })
    expect(file.edges[0]).toMatchObject({ source: "a", target: "b", direction: "forward", shape: "spline", stroke: "solid", holds: null })
  })
})
