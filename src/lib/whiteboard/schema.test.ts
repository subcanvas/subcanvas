import { describe, expect, it } from "vitest"
import * as Y from "yjs"

import { EMOJI_CATEGORIES } from "./emoji"
import { iconName, nodesMap, edgesMap, readEdge, readNode, singleEmoji, toYMap } from "./schema"

// A map has to live in a document before it can be read.
function inDocument(fields: Record<string, unknown>, kind: "node" | "edge" = "node") {
  const doc = new Y.Doc()
  const map = toYMap(fields)
  ;(kind === "node" ? nodesMap(doc) : edgesMap(doc)).set("x", map)
  return map
}

describe("readNode", () => {
  it("gives a node written before shapes and badges existed today's look", () => {
    const node = readNode("x", inDocument({ kind: "plain", title: "Old", x: 1, y: 2 }))
    expect(node).toMatchObject({ shape: "rectangle", icon: null, emoji: null })
  })

  it("reads a shape, an icon and an emoji", () => {
    const node = readNode("x", inDocument({ shape: "cylinder", icon: "database", emoji: "🐘" }))
    expect(node).toMatchObject({ shape: "cylinder", icon: "database", emoji: "🐘" })
  })

  it("falls back on anything it does not expect", () => {
    for (const hostile of [42, {}, [], true, "star of david", "<script>", "../../etc", "a".repeat(200), ""]) {
      const node = readNode("x", inDocument({ shape: hostile, icon: hostile, emoji: hostile }))
      expect(node).toMatchObject({ shape: "rectangle", icon: null, emoji: null })
    }
  })

  it("keeps an icon name it cannot draw, as long as it looks like one", () => {
    expect(readNode("x", inDocument({ icon: "icon-from-the-future" })).icon).toBe("icon-from-the-future")
  })
})

describe("readEdge", () => {
  it("reads an icon and an emoji, and nothing else in their place", () => {
    expect(readEdge("x", inDocument({ icon: "lock", emoji: "🔒" }, "edge"))).toMatchObject({ icon: "lock", emoji: "🔒" })
    expect(readEdge("x", inDocument({ icon: "Lock!", emoji: "lock" }, "edge"))).toMatchObject({ icon: null, emoji: null })
    expect(readEdge("x", inDocument({}, "edge"))).toMatchObject({ icon: null, emoji: null })
  })
})

describe("iconName", () => {
  it("accepts Lucide's kebab-case names only", () => {
    expect(iconName("git-pull-request")).toBe("git-pull-request")
    expect(iconName("building-2")).toBe("building-2")
    for (const bad of ["Server", "a--b", "-a", "a-", "a b", 'a"b', "", null, undefined, 7]) expect(iconName(bad)).toBeNull()
  })
})

describe("singleEmoji", () => {
  it("accepts one emoji, however many code points it is made of", () => {
    for (const emoji of ["🚀", "❤️", "👨‍👩‍👧‍👦", "🇳🇱", "👍🏽", "1️⃣", "🧑‍💻", " 🔥 "])
      expect(singleEmoji(emoji)).toBe(emoji.trim())
  })

  it("rejects everything else", () => {
    for (const bad of ["", " ", "a", "1", "ab", "🚀🚀", "🚀 x", "x🚀", "<", "&amp;", "‍", "é", 5, null, {}])
      expect(singleEmoji(bad)).toBeNull()
  })

  it("accepts every emoji the picker offers, each of them once", () => {
    const offered = EMOJI_CATEGORIES.flatMap((category) => category.emoji)
    for (const { emoji, words } of offered) {
      expect(singleEmoji(emoji), emoji).toBe(emoji)
      expect(words, emoji).not.toBe("")
    }
    expect(new Set(offered.map((choice) => choice.emoji)).size).toBe(offered.length)
  })
})
