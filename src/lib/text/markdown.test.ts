import { describe, expect, it } from "vitest"

import { blockToMarkdown, parseMarkdown, prepareMarkdown } from "./markdown"

type Block = Awaited<ReturnType<typeof parseMarkdown>>[number]
const propsOf = (block: Block) => block.props as Record<string, unknown>
const round = async (markdown: string) => {
  const blocks = await parseMarkdown(markdown)
  return Promise.all(blocks.map((block) => blockToMarkdown(block)))
}
const texts = (block: Block) =>
  (block.content as { type: string; text?: string; props?: { latex: string } }[]).map((piece) =>
    piece.type === "text" ? piece.text : `[${piece.type}:${piece.props?.latex}]`
  )

describe("Markdown for the app's own blocks", () => {
  it("reads display and inline maths, and leaves prices and code alone", async () => {
    const [paragraph, equation, code] = await parseMarkdown(
      "Euler: $e^{i\\pi} + 1 = 0$, for $5 or $10.\n\n$$\n\\frac{a}{b}\n$$\n\n```js\nconst price = \"$a$\"\n```"
    )
    expect(texts(paragraph)).toEqual(["Euler: ", "[inlineEquation:e^{i\\pi} + 1 = 0]", ", for $5 or $10."])
    expect([equation.type, equation.props]).toEqual(["equation", { latex: "\\frac{a}{b}" }])
    expect(texts(code)).toEqual(['const price = "$a$"'])
    expect((await parseMarkdown("$$ x^2 $$"))[0].props).toEqual({ latex: "x^2" })
  })

  it("writes maths back the way it was read", async () => {
    expect(await round("Inline $x_1^2$ here.\n\n$$\n\\sum_{i=1}^n i\n$$")).toEqual([
      "Inline $x_1^2$ here.",
      "$$\n\\sum_{i=1}^n i\n$$",
    ])
  })

  it("reads Notion's callouts, with the emoji as the icon, and an agent's, with blocks inside", async () => {
    const [notion, agent] = await parseMarkdown(
      "<aside>\n💡 A **Notion** callout\n</aside>\n\n<aside data-icon=\"⚠️\" data-background-color=\"red\">\n\nCareful\n\n- one\n- two\n\n</aside>"
    )
    expect([notion.type, propsOf(notion).icon, propsOf(notion).backgroundColor]).toEqual(["callout", "💡", "gray"])
    expect(texts(notion)).toEqual(["A ", "Notion", " callout"])
    expect([propsOf(agent).icon, propsOf(agent).backgroundColor, texts(agent)]).toEqual(["⚠️", "red", ["Careful"]])
    expect(agent.children.map((child) => child.type)).toEqual(["bulletListItem", "bulletListItem"])
  })

  it("writes a callout as an aside that reads back the same", async () => {
    const markdown = '<aside data-icon="⚠️" data-background-color="red">\n\nCareful\n\n* one\n* two\n\n</aside>'
    expect(await round(markdown)).toEqual([markdown])
    expect(await round("<aside>\n📌 Pinned\n</aside>")).toEqual(['<aside data-icon="📌">\n\nPinned\n\n</aside>'])
  })

  it("reads [TOC] as a table of contents", async () => {
    const [toc, heading] = await parseMarkdown("[TOC]\n\n## First")
    expect([toc.type, heading.type]).toEqual(["tableOfContents", "heading"])
    expect(await round("[TOC]")).toEqual(["[TOC]"])
  })

  it("does not rewrite what is inside a fence", () => {
    const fenced = "```\n$$\nx\n$$\n<aside>no</aside>\n[TOC]\n```"
    expect(prepareMarkdown(fenced)).toBe(fenced)
  })

  it("keeps maths that is never closed as text", async () => {
    const blocks = await parseMarkdown("$$\nx + y")
    expect(blocks.map((block) => block.type)).toEqual(["paragraph"])
  })
})
