import { describe, expect, it } from "vitest"

import { fixtureFiles } from "./__fixtures__/load"
import { planImport } from "./plan"
import { toBlocks } from "./write"

// What the notes look like once they are documents: the planned Markdown,
// through the same converter the import uses.

type Block = { type: string; props: Record<string, unknown>; content: unknown; children: Block[] }

async function convert(sample: Parameters<typeof fixtureFiles>[0]) {
  const decoder = new TextDecoder()
  const files = Object.entries(fixtureFiles(sample))
    .filter(([path]) => /\.(md|markdown|txt|csv)$/.test(path) && !path.startsWith("."))
    .map(([path, bytes]) => ({ path, text: decoder.decode(bytes) }))
  const plan = planImport(files, { intoDocument: false, newId: () => crypto.randomUUID(), hrefFor: (id) => `/o/p/d/${id}` })
  const blocksOf = async (title: string) => {
    const { blocks, plain } = await toBlocks(plan.documents.find((document) => document.title === title)!.markdown)
    expect(plain).toBe(false)
    return blocks as unknown as Block[]
  }
  return { plan, blocksOf }
}

const textOf = (content: unknown): string =>
  Array.isArray(content)
    ? content.map((piece) => (piece.type === "link" ? textOf(piece.content) : (piece.text ?? ""))).join("")
    : ""
const linksOf = (content: unknown) =>
  Array.isArray(content) ? content.filter((piece) => piece.type === "link").map((piece) => piece.href as string) : []

describe("converted documents", () => {
  it("keeps task lists with nesting, numbered lists, code with its language, and tables", async () => {
    const { blocksOf } = await convert("notion")
    const onboarding = await blocksOf("Onboarding")
    expect(onboarding.map((block) => block.type)).toEqual(["paragraph", "checkListItem", "checkListItem", "checkListItem", "paragraph"])
    expect(onboarding[1].props.checked).toBe(true)
    expect(onboarding[2].children.map((child) => [child.type, textOf(child.content)])).toEqual([["checkListItem", "Install the toolchain"]])

    const setup = await blocksOf("Laptop setup")
    expect(setup.map((block) => block.type)).toEqual(["numberedListItem", "numberedListItem", "codeBlock", "table"])
    expect(setup[2].props.language).toBe("bash")
    expect(textOf(setup[2].content)).toBe("curl -fsSL https://example.com/bootstrap.sh | bash")

    const [tasks] = await blocksOf("Tasks")
    const rows = (tasks.content as { rows: { cells: { content: unknown }[] }[] }).rows
    expect(rows.map((row) => row.cells.map((cell) => textOf(cell.content)))).toEqual([
      ["Name", "Status", "Owner", "Notes"],
      ["Write the handbook", "In progress", "Ada", "Chapters 1, 2 and 3"],
      ["Order laptops", "Done", "Grace", 'Ask about the "pro" model | urgent'],
    ])
  })

  it("turns links between notes into links between documents", async () => {
    const { plan, blocksOf } = await convert("obsidian")
    const id = (title: string) => plan.documents.find((document) => document.title === title)!.id
    const home = await blocksOf("Vault home")
    expect(linksOf(home[0].content)).toEqual([`/o/p/d/${id("Apollo")}`, `/o/p/d/${id("Glossary")}`])
    expect(textOf(home[1].content)).toContain("[[Nowhere]]")
    const callout = home.find((block) => block.type === "quote")!
    expect(textOf(callout.content)).toBe("Mind the gap\nNothing here is final.")
    // Footnotes have no block of their own, so they stay readable as text.
    expect((await blocksOf("Apollo")).map((block) => textOf(block.content))).toContain("[^1]: To plain text.")
  })

  it("reads Windows files, degrades HTML to its text, and never keeps a script", async () => {
    const { blocksOf } = await convert("docs")
    const handbook = await blocksOf("Handbook")
    const text = handbook.map((block) => textOf(block.content))
    expect(text[0]).toBe("Written on Windows: a byte-order mark and CRLF line endings.")
    expect(text).toContain("HTML degrades to text.")
    expect(JSON.stringify(handbook)).not.toMatch(/alert|script|\\r|﻿/)

    const faq = await blocksOf("Frequently asked questions")
    expect(faq.map((block) => block.type)).toEqual(["quote", "divider", "paragraph"])
    const install = await blocksOf("Install")
    expect(install.map((block) => block.type)).toEqual(["paragraph", "image", "paragraph"])
    expect(install[1].props.url).toBe("https://example.com/badge.svg")
    expect(linksOf(install[2].content)).toHaveLength(2)
  })

  it("converts a very long note", async () => {
    const long = Array.from({ length: 2000 }, (_, index) => `## Section ${index}\n\nParagraph ${index} with **bold**.\n`).join("\n")
    const { blocks } = await toBlocks(long)
    expect(blocks).toHaveLength(4000)
  }, 30_000)
})
