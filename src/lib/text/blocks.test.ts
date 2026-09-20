import { describe, expect, it } from "vitest"
import * as Y from "yjs"

import { applyBlockEdit, NO_BLOCK, parseMarkdown, readBlocks } from "./blocks"

async function documentOf(markdown: string) {
  const doc = new Y.Doc()
  applyBlockEdit(doc, { kind: "append", blocks: await parseMarkdown(markdown) })
  return doc
}
const markdownOf = async (doc: Y.Doc) => (await readBlocks(doc)).map((block) => block.markdown)

describe("block edits by id", () => {
  it("writes a document nobody has opened, and reads it back with ids", async () => {
    const blocks = await readBlocks(await documentOf("# Title\n\nBody\n\n- a\n  - nested\n"))
    expect(blocks.map((block) => [block.type, block.markdown])).toEqual([
      ["heading", "# Title"],
      ["paragraph", "Body"],
      ["bulletListItem", "* a\n  * nested"],
    ])
    expect(new Set(blocks.map((block) => block.id)).size).toBe(3)
  })

  it("inserts, replaces, and deletes without touching the other blocks", async () => {
    const doc = await documentOf("one\n\ntwo\n\nthree")
    const [one, two, three] = await readBlocks(doc)

    applyBlockEdit(doc, { kind: "insert-after", blockId: one.id, blocks: await parseMarkdown("one and a half") })
    const replaced = applyBlockEdit(doc, { kind: "replace", blockId: two.id, blocks: await parseMarkdown("## Two") })
    applyBlockEdit(doc, { kind: "delete", blockId: three.id })

    const after = await readBlocks(doc)
    expect(after.map((block) => block.markdown)).toEqual(["one", "one and a half", "## Two"])
    expect(after[0].id).toBe(one.id)
    expect(replaced).toEqual({ added: [after[2].id] })
  })

  it("finds a nested block by its id", async () => {
    const doc = await documentOf("- parent\n  - child\n")
    const nested = doc.getXmlFragment("blocknote").toString().match(/id="([^"]+)"/g)![1].slice(4, -1)
    applyBlockEdit(doc, { kind: "replace", blockId: nested, blocks: await parseMarkdown("- changed") })
    expect(await markdownOf(doc)).toEqual(["* parent\n  * changed"])
  })

  it("changes nothing when the block is gone", async () => {
    const doc = await documentOf("one")
    const before = Y.encodeStateVector(doc)
    expect(applyBlockEdit(doc, { kind: "delete", blockId: "missing" })).toEqual({ error: NO_BLOCK })
    expect(Y.encodeStateVector(doc)).toEqual(before)
  })

  it("never leaves a document with no blocks, and writes over the empty one", async () => {
    const opened = await documentOf("placeholder")
    const [only] = await readBlocks(opened)
    applyBlockEdit(opened, { kind: "delete", blockId: only.id })
    expect(await markdownOf(opened)).toEqual([""])
    applyBlockEdit(opened, { kind: "append", blocks: await parseMarkdown("first words") })
    expect(await markdownOf(opened)).toEqual(["first words"])
  })

  it("merges with an edit made to another block at the same time", async () => {
    const doc = await documentOf("one\n\ntwo")
    const [one] = await readBlocks(doc)
    const other = new Y.Doc()
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc))

    applyBlockEdit(doc, { kind: "append", blocks: await parseMarkdown("from the agent") })
    applyBlockEdit(other, { kind: "insert-after", blockId: one.id, blocks: await parseMarkdown("from a person") })
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other))
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc))

    expect(await markdownOf(doc)).toEqual(["one", "from a person", "two", "from the agent"])
    expect(await markdownOf(other)).toEqual(await markdownOf(doc))
  })
})
