// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { fixtureFiles } from "./__fixtures__/load"
import { planImport, type ImportPlan } from "./plan"
import { htmlToBlocks } from "./write"

// A Notion workspace exported as HTML: the wiki page holds one of every kind
// of block, a subpage, and a database with one row.

type Block = { type: string; props: Record<string, unknown>; content?: unknown; children: Block[] }

function plan(sample: "notion-html" | "notion-html-2026" = "notion-html"): ImportPlan {
  const decoder = new TextDecoder()
  const all = Object.entries(fixtureFiles(sample))
  const files = all
    .filter(([path]) => /\.(html|csv)$/.test(path))
    .map(([path, bytes]) => ({ path, text: decoder.decode(bytes) }))
  let n = 0
  return planImport(files, {
    intoDocument: false,
    attachments: all.map(([path]) => path).filter((path) => path.endsWith(".png")),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    hrefFor: (id) => `/d/${id}`,
  })
}
const titled = (result: ImportPlan, title: string) => result.documents.find((document) => document.title === title)!
const text = (content: unknown): string =>
  Array.isArray(content)
    ? content.map((piece) => (piece.type === "link" ? text(piece.content) : (piece.text ?? `[${piece.type}]`))).join("")
    : ""
async function blocksOf(result: ImportPlan, title: string) {
  const { blocks, plain } = await htmlToBlocks(titled(result, title).html!)
  expect(plain).toBe(false)
  return blocks as unknown as Block[]
}

describe("a Notion HTML export", () => {
  it("nests pages as Notion did, names them by their titles, and points links at the documents", () => {
    const result = plan()
    const parentOf = (title: string) => {
      const parent = titled(result, title).parent
      return parent.kind === "document" ? result.documents.find((document) => document.id === parent.id)!.title : parent.kind
    }
    expect(result.documents.map((document) => [document.title, parentOf(document.title)])).toEqual([
      ["Team Wiki", "target"],
      ["Onboarding", "Team Wiki"],
      ["Tasks", "Team Wiki"],
      ["Write the handbook", "Tasks"],
    ])
    expect(result.documents.every((document) => document.markdown === "" && document.html)).toBe(true)
    expect(titled(result, "Onboarding").html).toContain(`<a href="/d/${titled(result, "Team Wiki").id}">Team Wiki</a>`)
    // One link to a page that was not exported, and one image of the export's own.
    expect([result.unlinked, result.localImages, result.tablesLeftOut]).toEqual([1, 1, 0])
  })

  it("keeps nothing that could run", () => {
    const html = titled(plan(), "Team Wiki").html!
    expect(html).not.toMatch(/<script|<style|onclick|javascript:|@import|class="(?!language-)/)
  })

  it("turns each kind of Notion block into the block the editor has for it", async () => {
    const result = plan()
    const blocks = await blocksOf(result, "Team Wiki")
    const types = blocks.map((block) => block.type)
    const find = (type: string, nth = 0) => blocks.filter((block) => block.type === type)[nth]

    expect(types).toEqual([
      "paragraph", // the page's description
      "tableOfContents",
      "heading",
      "paragraph",
      "paragraph",
      "callout",
      "columnList",
      "equation",
      "paragraph",
      "bookmark",
      "bookmark",
      "documentLink",
      "documentLink",
      "checkListItem",
      "checkListItem",
      "toggleListItem",
      "heading",
      "codeBlock",
      "codeBlock",
      "quote",
      "divider",
      "table",
      "paragraph", // the image, as its caption's words
      "paragraph",
      "paragraph",
    ])

    // Text styles and colours, and mentions as their words.
    const styled = find("paragraph", 1).content as { text: string; styles: Record<string, unknown> }[]
    expect(text(styled)).toBe(
      "Plain, bold, italic, underlined, code, red text and a yellow highlight. Ask @Ada Lovelace by @September 24, 2026."
    )
    expect(styled.find((piece) => piece.text === "underlined")?.styles).toEqual({ underline: true })
    expect(styled.find((piece) => piece.text === "red text")?.styles).toEqual({ textColor: "red" })
    expect(styled.find((piece) => piece.text === "a yellow highlight")?.styles).toEqual({ backgroundColor: "yellow" })
    expect(find("paragraph", 2).props.backgroundColor).toBe("blue")

    const callout = find("callout")
    expect([callout.props.icon, callout.props.backgroundColor, text(callout.content)]).toEqual(["💡", "gray", "Read this first."])
    expect(callout.children.map((child) => [child.type, text(child.content)])).toEqual([["bulletListItem", "Nested point"]])

    const columns = find("columnList").children
    expect(columns.map((column) => [column.props.width, text(column.children[0].content)])).toEqual([
      [0.5, "Left column"],
      [0.5, "Right column"],
    ])

    expect(find("equation").props.latex).toBe("E = mc^2")
    const euler = find("paragraph", 3).content as { type: string; props?: { latex: string } }[]
    expect(euler.find((piece) => piece.type === "inlineEquation")?.props?.latex).toBe("e^{i\\pi} + 1 = 0")

    expect(find("bookmark").props).toEqual({
      url: "https://nextjs.org/docs",
      title: "Next.js Docs",
      description: "Welcome to the Next.js Documentation.",
    })
    expect(find("bookmark", 1).props).toMatchObject({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "" })

    expect([find("documentLink").props.docId, find("documentLink", 1).props.docId]).toEqual([
      titled(result, "Onboarding").id,
      titled(result, "Tasks").id,
    ])
    expect([find("checkListItem").props.checked, text(find("checkListItem").content)]).toEqual([true, "Get a laptop"])
    expect(find("checkListItem", 1).props.checked).toBe(false)
    expect([text(find("toggleListItem").content), text(find("toggleListItem").children[0].content)]).toEqual([
      "How do I get access?",
      "Ask in #it.",
    ])
    const toggleHeading = find("heading", 1)
    expect([toggleHeading.props.level, toggleHeading.props.isToggleable, text(toggleHeading.children[0].content)]).toEqual([2, true, "Folded away."])
    expect([find("codeBlock").props.language, find("codeBlock", 1).props.language]).toEqual(["javascript", "text"])
    expect(text(find("paragraph", 4).content)).toBe("Office map")
    expect(text(blocks.at(-1)!.content)).toBe("bad link")
  })

  it("makes a database's rows a table that links to each row's page, and a row's properties a table on its page", async () => {
    const result = plan()
    const [table] = await blocksOf(result, "Tasks")
    const rows = (table.content as { rows: { cells: { content: unknown }[] }[] }).rows
    expect(rows.map((row) => row.cells.map((cell) => text(cell.content)))).toEqual([
      ["Name", "Status", "Owner"],
      ["Write the handbook", "In progress", "Ada Lovelace"],
    ])
    expect(JSON.stringify(rows[1].cells[0].content)).toContain(`/d/${titled(result, "Write the handbook").id}`)

    const [properties, body] = await blocksOf(result, "Write the handbook")
    const cells = (properties.content as { rows: { cells: { content: unknown }[] }[] }).rows
    expect(cells.map((row) => row.cells.map((cell) => text(cell.content)))).toEqual([
      ["Status", "In progress"],
      ["Owner", "Ada Lovelace"],
      ["Tags", "docs, writing"],
    ])
    expect(text(body.content)).toBe("Chapters 1, 2 and 3.")
  })

  it("reads a 2026 export: folders named by title, the index and a database's CSV left out, and its newer markup", async () => {
    const result = plan("notion-html-2026")
    const parentOf = (document: ImportPlan["documents"][number]) => {
      const parent = document.parent
      return parent.kind === "document" ? result.documents.find((other) => other.id === parent.id)!.title : parent.kind
    }
    // The export's own folder is gone, and so are its index and the CSV
    // beside the database's page. Two pages called Notes each get their own
    // folder's pages: the one with the short id, and the one without.
    expect(result.folders).toEqual([])
    expect(result.documents.map((document) => [document.title, parentOf(document)])).toEqual([
      ["Handbook", "target"],
      ["Notes", "Handbook"],
      ["First", "Notes"],
      ["Notes", "Handbook"],
      ["Second", "Notes"],
      ["Reading list", "Handbook"],
      ["Dune", "Reading list"],
      ["Setup", "Handbook"],
    ])
    const [first, second] = result.documents.filter((document) => document.title === "Notes")
    expect(result.documents.find((document) => document.title === "First")!.parent).toEqual({ kind: "document", id: first.id })
    expect(result.documents.find((document) => document.title === "Second")!.parent).toEqual({ kind: "document", id: second.id })

    const blocks = (await htmlToBlocks(titled(result, "Handbook").html!)).blocks as unknown as Block[]
    const find = (type: string, nth = 0) => blocks.filter((block) => block.type === type)[nth]
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "callout",
      "callout",
      "equation",
      "paragraph",
      "checkListItem",
      "checkListItem",
      "toggleListItem",
      "heading",
      "codeBlock",
      "columnList",
      "bookmark",
      "documentLink",
      "paragraph",
      "table",
    ])
    const wrapped = find("paragraph").content as { text: string; styles: Record<string, unknown> }[]
    // "Default" is no colour at all, so those words are part of the plain text round them.
    expect(wrapped.find((piece) => piece.text.includes("no colour"))?.styles).toEqual({})
    expect(wrapped.find((piece) => piece.text === "green words")?.styles).toEqual({ textColor: "green" })
    expect([find("callout").props.icon, find("callout").props.backgroundColor]).toEqual(["💡", "green"])
    expect([find("callout", 1).props.icon, find("callout", 1).props.backgroundColor, text(find("callout", 1).content)]).toEqual([
      "",
      "pink",
      "A callout with no icon.",
    ])
    expect(find("equation").props.latex).toBe("\\int_0^1 x\\,dx = \\frac{1}{2}")
    const pythagoras = find("paragraph", 1).content as { type: string; props?: { latex: string } }[]
    expect(pythagoras.find((piece) => piece.type === "inlineEquation")?.props?.latex).toBe("a^2 + b^2 = c^2")
    expect([find("checkListItem").props.checked, find("checkListItem", 1).props.checked]).toEqual([true, false])
    expect(text(find("toggleListItem").children[0].content)).toBe("Its answer.")
    expect([find("heading").props.level, find("heading").props.isToggleable]).toEqual([4, true])
    expect(find("codeBlock").props.language).toBe("python")
    expect(find("columnList").children.map((column) => column.props.width)).toEqual([0.3125, 0.6875])
    expect(find("bookmark").props.url).toBe("https://github.com/example/repository")
    expect(find("documentLink").props.docId).toBe(titled(result, "Setup").id)
    // A page mentioned in the text links to its document, without Notion's icon.
    const mention = (find("paragraph", 2).content as { type: string; href?: string; content?: unknown }[]).filter((piece) => piece.type === "link")
    expect(mention.map((link) => [text(link.content), link.href])).toEqual([
      ["the other notes", `/d/${second.id}`],
      ["a page outside the export", "https://app.notion.com/p/0123456789abcdef0123456789abcdef?pvs=21"],
    ])
    const rows = (find("table").content as { rows: { cells: { content: unknown }[] }[] }).rows
    expect(rows.map((row) => row.cells.map((cell) => text(cell.content)))).toEqual([
      ["Key", "Value"],
      ["colour", "green"],
    ])

    const [list] = (await htmlToBlocks(titled(result, "Reading list").html!)).blocks as unknown as Block[]
    const listRows = (list.content as { rows: { cells: { content: unknown }[] }[] }).rows
    expect(listRows.map((row) => row.cells.map((cell) => text(cell.content)))).toEqual([
      ["Name", "Status"],
      ["Dune", "Read"],
    ])
    const [properties] = (await htmlToBlocks(titled(result, "Dune").html!)).blocks as unknown as Block[]
    const propertyRows = (properties.content as { rows: { cells: { content: unknown }[] }[] }).rows
    expect(propertyRows.map((row) => row.cells.map((cell) => text(cell.content)))).toEqual([
      ["Status", "Read"],
      ["Finished", "August 1, 2026"],
    ])
  })

  it("keeps only web addresses in what the server is sent, however it was sent", async () => {
    const { blocks } = await htmlToBlocks(
      '<p><a href="javascript:alert(1)">x</a> <a href="https://example.com">y</a></p>' +
        '<figure data-bookmark data-url="javascript:alert(2)"></figure><img src="javascript:alert(3)"><img src="https://example.com/a.png">'
    )
    expect(JSON.stringify(blocks)).not.toContain("javascript:")
    expect((blocks as unknown as Block[]).map((block) => block.type)).toEqual(["paragraph", "image"])
  })

  it("uploads a picture of the export with the page that shows it, filed under that page", async () => {
    const org = "11111111-1111-4111-8111-111111111111"
    const project = "22222222-2222-4222-8222-222222222222"
    const decoder = new TextDecoder()
    const all = Object.entries(fixtureFiles("notion-html"))
    let n = 0
    const result = planImport(
      all.filter(([path]) => path.endsWith(".html")).map(([path, bytes]) => ({ path, text: decoder.decode(bytes) })),
      {
        intoDocument: false,
        attachments: all.map(([path]) => path).filter((path) => path.endsWith(".png")),
        newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        hrefFor: (id) => `/d/${id}`,
        media: { orgId: org, projectId: project, has: (path) => path.endsWith("office-map.png") },
      }
    )
    const wiki = titled(result, "Team Wiki")
    expect(result.localImages).toBe(0)
    expect(result.uploads).toEqual([
      {
        documentId: wiki.id,
        source: "Team Wiki 1f0c2a9b7d3e4f5a8b6c9d0e1f2a3b4c/office-map.png",
        path: expect.stringMatching(new RegExp(`^${org}/${project}/${wiki.id}/[0-9a-f-]{36}\\.png$`)),
      },
    ])

    const { blocks } = await htmlToBlocks(wiki.html!, wiki.id)
    const image = (blocks as unknown as Block[]).find((block) => block.type === "image")!
    expect(image.props).toMatchObject({ url: `/api/media/${result.uploads[0].path}`, caption: "Office map" })

    // Sent for another document, the same page keeps no picture: a file is
    // read by the readers of the document it is filed under.
    const elsewhere = await htmlToBlocks(wiki.html!, titled(result, "Onboarding").id)
    expect((elsewhere.blocks as unknown as Block[]).some((block) => block.type === "image")).toBe(false)
  })
})
