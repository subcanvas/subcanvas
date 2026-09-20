import { z } from "zod"

import { loadDocument } from "@/lib/sync/server-document"
import { applyBlockEdit, parseMarkdown, readBlocks, type BlockEdit } from "@/lib/text/blocks"

import { editDocument } from "../edit-document"
import { findTypedDocument } from "../lookup"
import { defineTool, id, type ToolContext } from "../tool"

const documentId = id("The text document.")
const blockId = z
  .string()
  .min(1)
  .describe("A block's id, from `read_text_document`. Ids are stable: they survive edits to other blocks.")
const markdown = z
  .string()
  .min(1)
  .describe("Markdown. It may hold several blocks (headings, paragraphs, lists, code, tables, quotes); each becomes its own block.")

// A document imported from a repository is owned by the file it came from,
// and the web app shows it read-only too.
const READ_ONLY = "This document is kept in step with a file in a repository, so it cannot be edited here. Edit the file instead."

async function edit(
  context: ToolContext,
  textDocumentId: string,
  build: () => Promise<BlockEdit>,
  done: (added: string[]) => string
) {
  const document = await findTypedDocument(context, textDocumentId, "text")
  if ("error" in document) return document
  if (document.source) return { error: READ_ONLY }

  const blockEdit = await build()
  const result = await editDocument(context, document.id, (doc) => applyBlockEdit(doc, blockEdit))
  if ("error" in result) return result
  return { text: done(result.added), data: { document_id: document.id, added_block_ids: result.added } }
}

const added = (ids: string[]) => `${ids.length} block${ids.length === 1 ? "" : "s"} (${ids.join(", ")})`

export const textTools = [
  defineTool({
    name: "read_text_document",
    title: "Read a text document",
    group: "Text documents",
    description:
      "Returns a text document as Markdown, one entry per top-level block with the block's id. Use those ids with `replace_block`, `insert_after_block`, and `delete_block`. A list item's indented children are part of its Markdown. The conversion to Markdown is slightly lossy (text colors and alignment are dropped). People may be typing in the same document; what you read is at most about a second old.",
    input: { document_id: documentId },
    kind: "read",
    run: async (context, { document_id }) => {
      const document = await findTypedDocument(context, document_id, "text")
      if ("error" in document) return document
      const doc = await loadDocument(context.supabase, document.id)
      if (!doc) return { error: "This document could not be read." }

      const blocks = await readBlocks(doc)
      return {
        text: [
          `# "${document.title}" (${document.id})${document.source ? ", read only: imported from a repository" : ""}`,
          ...blocks.map((block) => `<!-- block ${block.id} -->\n${block.markdown}`),
        ].join("\n\n"),
        data: { document_id: document.id, title: document.title, read_only: document.source !== null, blocks },
      }
    },
  }),

  defineTool({
    name: "append_markdown",
    title: "Append Markdown to a text document",
    group: "Text documents",
    description:
      "Adds Markdown to the end of a text document as new blocks, and returns their ids. It merges with whatever people are typing at the same moment; nothing already there is touched.",
    input: { document_id: documentId, markdown },
    kind: "write",
    run: (context, args) =>
      edit(
        context,
        args.document_id,
        async () => ({ kind: "append", blocks: await parseMarkdown(args.markdown) }),
        (ids) => `Appended ${added(ids)}.`
      ),
  }),

  defineTool({
    name: "insert_after_block",
    title: "Insert Markdown after a block",
    group: "Text documents",
    description:
      "Inserts Markdown as new blocks right after the block with the given id, at the same nesting level, and returns the new ids. To add to the very end, use `append_markdown`.",
    input: { document_id: documentId, block_id: blockId, markdown },
    kind: "write",
    run: (context, args) =>
      edit(
        context,
        args.document_id,
        async () => ({ kind: "insert-after", blockId: args.block_id, blocks: await parseMarkdown(args.markdown) }),
        (ids) => `Inserted ${added(ids)}.`
      ),
  }),

  defineTool({
    name: "replace_block",
    title: "Replace a block",
    group: "Text documents",
    description:
      "Replaces the block with the given id, and any children nested under it, with new blocks made from Markdown. The new blocks get new ids, which are returned; the old id stops existing. If someone is typing in that block at the same moment, their typing is lost with it, so prefer inserting next to a block over replacing one that is being edited.",
    input: { document_id: documentId, block_id: blockId, markdown },
    kind: "destructive",
    run: (context, args) =>
      edit(
        context,
        args.document_id,
        async () => ({ kind: "replace", blockId: args.block_id, blocks: await parseMarkdown(args.markdown) }),
        (ids) => `Replaced the block with ${added(ids)}.`
      ),
  }),

  defineTool({
    name: "delete_block",
    title: "Delete a block",
    group: "Text documents",
    description:
      "Deletes the block with the given id, and any children nested under it. Deleting an id that is already gone is reported as an error and changes nothing.",
    input: { document_id: documentId, block_id: blockId },
    kind: "destructive",
    run: (context, args) =>
      edit(
        context,
        args.document_id,
        async () => ({ kind: "delete", blockId: args.block_id }),
        () => "Deleted the block."
      ),
  }),
]
