import { describe, expect, it } from "vitest"
import * as Y from "yjs"

import { readMarkdownFile } from "@/lib/import/markdown-file"
import { toBlocks } from "@/lib/import/write"
import { applyBlockEdit, parseMarkdown } from "@/lib/text/blocks"

import { exportMarkdown, linkedDocumentIds, markdownTitle, MISSING_DOCUMENT, readTextBlocks, type LinkedDocument } from "./markdown"

const ORIGIN = "https://app.test"
const ORG = "11111111-1111-4111-8111-111111111111"
const PROJECT = "22222222-2222-4222-8222-222222222222"
const HERE = "33333333-3333-4333-8333-333333333333"
const OTHER = "44444444-4444-4444-8444-444444444444"
const GONE = "55555555-5555-4555-8555-555555555555"
const PICTURE = `${ORG}/${PROJECT}/${HERE}/66666666-6666-4666-8666-666666666666.png`
const VIDEO = `${ORG}/${PROJECT}/${HERE}/77777777-7777-4777-8777-777777777777.mp4`

const text = (value: string) => ({ type: "text", text: value, styles: {} })
const link = (href: string, words: string) => ({ type: "link", href, content: [text(words)] })

// A document the way the editor stores it: blocks, written into a Y.Doc.
function documentOf(blocks: unknown[]) {
  const doc = new Y.Doc()
  applyBlockEdit(doc, { kind: "append", blocks: blocks as never })
  return readTextBlocks(doc)
}

const blocks = () =>
  documentOf([
    { type: "heading", props: { level: 2 }, content: [text("Steps")] },
    {
      type: "paragraph",
      content: [
        text("See "),
        link(`/acme/${PROJECT}/d/${OTHER}?via=${HERE}`, "the other page"),
        text(" and "),
        link("https://example.com/docs", "the web"),
        text(", with "),
        { type: "inlineEquation", props: { latex: "x^2" } },
        text("."),
      ],
    },
    { type: "numberedListItem", content: [text("One")] },
    { type: "numberedListItem", content: [text("Two")] },
    { type: "image", props: { url: `/api/media/${PICTURE}`, name: "shot.png", caption: "The service map" } },
    { type: "video", props: { url: `/api/media/${VIDEO}`, name: "demo.mp4", caption: "" } },
    { type: "equation", props: { latex: "\\frac{a}{b}" } },
    { type: "tableOfContents" },
    {
      type: "callout",
      props: { icon: "⚠️", backgroundColor: "red" },
      content: [text("Careful")],
      children: [{ type: "image", props: { url: `/api/media/${PICTURE}`, name: "again.png", caption: "" } }],
    },
    { type: "documentLink", props: { docId: OTHER } },
    { type: "documentLink", props: { docId: GONE } },
  ])

const documents = new Map<string, LinkedDocument>([
  [OTHER, { title: "Other page", url: `${ORIGIN}/acme/${PROJECT}/d/${OTHER}` }],
  [GONE, null],
])

describe("a text document as a Markdown file", () => {
  it("finds the documents it links to, by card and by link", () => {
    expect(linkedDocumentIds(blocks(), ORIGIN).sort()).toEqual([OTHER, GONE].sort())
  })

  it("opens with its title and writes the app's own blocks as the MCP tools do", async () => {
    const { markdown } = await exportMarkdown(blocks(), { title: "Payments_v2 *draft*", origin: ORIGIN, documents })
    expect(markdown.startsWith("# Payments\\_v2 \\*draft\\*\n\n## Steps\n")).toBe(true)
    expect(markdown).toContain("1. One\n2. Two")
    expect(markdown).toContain("$x^2$")
    expect(markdown).toContain("$$\n\\frac{a}{b}\n$$")
    expect(markdown).toContain("[TOC]")
    expect(markdown).toContain(`<aside data-icon="⚠️" data-background-color="red">\n\nCareful\n\n![again.png](${ORIGIN}/api/media/${PICTURE})\n\n</aside>`)
  })

  it("writes the app's addresses in full, and says which ones an export may point at its files", async () => {
    const exported = await exportMarkdown(blocks(), { title: "Page", origin: ORIGIN, documents })
    const page = `${ORIGIN}/acme/${PROJECT}/d/${OTHER}`
    expect(exported.markdown).toContain(`[the other page](${page})`)
    expect(exported.markdown).toContain("[the web](https://example.com/docs)")
    // A card is a link on a line of its own; one to a document nobody can
    // open says so, as the editor does.
    expect(exported.markdown).toContain(`\n[Other page](${page})\n`)
    expect(exported.markdown).toContain(MISSING_DOCUMENT)
    expect(exported.links).toEqual({ [OTHER]: page })
  })

  it("writes pictures and videos as `![caption](address)`, each file once", async () => {
    const exported = await exportMarkdown(blocks(), { title: "Page", origin: ORIGIN, documents })
    expect(exported.markdown).toContain(`![The service map](${ORIGIN}/api/media/${PICTURE})`)
    expect(exported.markdown).toContain(`![demo.mp4](${ORIGIN}/api/media/${VIDEO})`)
    expect(exported.markdown).not.toContain("<figure")
    expect(exported.media).toEqual([
      { path: PICTURE, url: `${ORIGIN}/api/media/${PICTURE}`, name: "The service map" },
      { path: VIDEO, url: `${ORIGIN}/api/media/${VIDEO}`, name: "demo.mp4" },
    ])
  })

  it("is read back by Import files: the same title, and the same kinds of block", async () => {
    const title = "Q3 plan: C# *and* snake_case #"
    const exported = await exportMarkdown(blocks(), { title, origin: ORIGIN, documents })
    const note = readMarkdownFile("Q3 plan.md", exported.markdown)
    expect(note.title).toBe(title)

    const back = await parseMarkdown(note.body)
    expect(back.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "numberedListItem",
      "numberedListItem",
      "image",
      "video",
      "equation",
      "tableOfContents",
      "callout",
      "paragraph",
      "paragraph",
    ])
  })

  it("brings a video back as a video once its file is uploaded again", async () => {
    const { blocks: imported } = await toBlocks(`![demo](/api/media/${VIDEO})\n\n![map](/api/media/${PICTURE})`, HERE)
    expect(imported.map((block) => block.type)).toEqual(["video", "image"])
  })

  it("escapes only what would change a title", () => {
    expect(markdownTitle("Plain title")).toBe("Plain title")
    expect(markdownTitle("<b>[x]</b>")).toBe("\\<b>\\[x\\]\\</b>")
    expect(markdownTitle("Issue ##")).toBe("Issue \\#\\#")
    expect(markdownTitle("  ")).toBe("Untitled")
  })
})
