// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { fixtureFiles } from "./__fixtures__/load"
import { planImport, type ImportPlan } from "./plan"
import { htmlToBlocks, toBlocks } from "./write"

// Two exports of the same small workspace, made in Notion on 2026-09-27: once
// as HTML and once as Markdown & CSV, subpages included. A page with one of
// most kinds of block, a picture, an inline database of two rows, and two
// subpages, one of which mentions the other. Unlike the hand-made samples,
// these are exactly what Notion wrote, so a change in its format shows here.

type Block = { type: string; props: Record<string, unknown>; content?: unknown; children: Block[] }

const ORG = "11111111-1111-4111-8111-111111111111"
const PROJECT = "22222222-2222-4222-8222-222222222222"

function plan(sample: "notion-export-html" | "notion-export-markdown"): ImportPlan {
  const decoder = new TextDecoder()
  const all = Object.entries(fixtureFiles(sample))
  const notes = all.filter(([path]) => /\.(html|md|csv)$/.test(path))
  const attachments = all.map(([path]) => path).filter((path) => path.endsWith(".png"))
  let n = 0
  return planImport(
    notes.map(([path, bytes]) => ({ path, text: decoder.decode(bytes) })),
    {
      intoDocument: false,
      attachments,
      newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
      hrefFor: (id) => `/d/${id}`,
      media: { orgId: ORG, projectId: PROJECT, has: (path) => attachments.includes(path) },
    }
  )
}

const titled = (result: ImportPlan, title: string) => result.documents.find((document) => document.title === title)!
function tree(result: ImportPlan) {
  const titleOf = (id: string) => result.documents.find((document) => document.id === id)!.title
  return result.documents
    .map((document) => [document.title, document.parent.kind === "document" ? titleOf(document.parent.id) : document.parent.kind])
    .sort(([a], [b]) => a.localeCompare(b))
}
async function blocksOf(result: ImportPlan, title: string) {
  const document = titled(result, title)
  const { blocks } = document.html ? await htmlToBlocks(document.html, document.id) : await toBlocks(document.markdown, document.id)
  return blocks as unknown as Block[]
}
const text = (content: unknown): string =>
  Array.isArray(content) ? content.map((piece) => (piece.type === "link" ? text(piece.content) : (piece.text ?? ""))).join("") : ""
const find = (blocks: Block[], type: string) => blocks.find((block) => block.type === type)

const PAGES = [
  ["Ledger service", "Subcanvas import test"],
  ["Notifications", "Service catalog"],
  ["Payments", "Service catalog"],
  ["Payments service", "Subcanvas import test"],
  ["Service catalog", "Subcanvas import test"],
  ["Subcanvas import test", "target"],
]

describe("a real Notion export", () => {
  for (const sample of ["notion-export-html", "notion-export-markdown"] as const) {
    it(`${sample}: nests the pages as Notion did, with one document for the inline database`, () => {
      const result = plan(sample)
      expect(tree(result)).toEqual(PAGES)
      // Its folder of rows belongs to the table, not to an empty page of its own.
      expect(titled(result, "Service catalog").path).toMatch(/\.csv$/)
      expect([result.skipped, result.unlinked, result.localImages]).toEqual([[], 0, 0])
    })

    it(`${sample}: uploads the picture with the page that shows it`, async () => {
      const result = plan(sample)
      const page = titled(result, "Subcanvas import test")
      expect(result.uploads).toEqual([
        { documentId: page.id, source: "Subcanvas import test/service-map.png", path: expect.stringMatching(new RegExp(`^${ORG}/${PROJECT}/${page.id}/`)) },
      ])
      const image = find(await blocksOf(result, "Subcanvas import test"), "image")!
      expect(image.props.url).toBe(`/api/media/${result.uploads[0].path}`)
    })

    it(`${sample}: a mention of another page is a link to its document`, async () => {
      const result = plan(sample)
      const [paragraph] = await blocksOf(result, "Ledger service")
      const link = (paragraph.content as { type: string; href?: string }[]).find((piece) => piece.type === "link")
      expect(link?.href).toBe(`/d/${titled(result, "Payments service").id}`)
    })

    it(`${sample}: the callout keeps its icon and its text, with the toggle inside it`, async () => {
      const callout = find(await blocksOf(plan(sample), "Subcanvas import test"), "callout")!
      expect(callout.props.icon).toBe("💡")
      expect(text(callout.content)).toBe("Arrows come from .subcanvas files.")
      expect(text(callout.children[0].content)).toBe("Why nested whiteboards")
    })

    it(`${sample}: the equation, the code and the table come through`, async () => {
      const blocks = await blocksOf(plan(sample), "Subcanvas import test")
      expect(find(blocks, "equation")?.props.latex).toBe("\\sum_{i=1}^{n} x_i = \\frac{n(n+1)}{2}")
      expect(text(find(blocks, "codeBlock")?.content)).toBe("const api = createServer({ port: 8080 })\napi.listen()")
      const table = blocks.filter((block) => block.type === "table").at(-1)!
      const rows = (table.content as { rows: { cells: unknown[] }[] }).rows
      expect(rows.map((row) => row.cells.map((cell) => text(Array.isArray(cell) ? cell : (cell as { content: unknown }).content)))).toEqual([
        ["Service", "Owner", "Language"],
        ["API", "Platform", "Go"],
        ["Ledger", "Finance", "Rust"],
      ])
    })
  }

  // What only the HTML export says; its Markdown says less, and that is why
  // docs/IMPORTING.md recommends HTML.
  it("the HTML export keeps colour, columns, bookmarks and pages as cards", async () => {
    const result = plan("notion-export-html")
    const blocks = await blocksOf(result, "Subcanvas import test")
    const red = blocks.find((block) => text(block.content).startsWith("This line should come in red"))!
    expect(red.props.textColor).toBe("red")
    const columns = find(blocks, "columnList")!
    expect(columns.children.map((column) => text(column.children[0].content).trim())).toEqual([
      "Left column: the web app renders on the server. It is written in TypeScript.",
      "Right column: the ledger runs nightly.",
    ])
    expect(find(blocks, "bookmark")?.props.url).toBe("https://github.com/subcanvas/subcanvas")
    expect(blocks.filter((block) => block.type === "documentLink").map((block) => block.props.docId)).toEqual([
      titled(result, "Ledger service").id,
      titled(result, "Payments service").id,
    ])
  })
})
