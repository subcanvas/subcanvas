import "server-only"

import * as Y from "yjs"

import { TEXT_FRAGMENT } from "@/lib/sync/text-fragment"

import { blockToMarkdown } from "./markdown"
import { serverEditor, type ServerBlocks } from "./server-editor"

// Block-level reads and edits of a text document's Yjs state, for callers
// that are not an editor: the MCP server. A block is addressed by its id,
// never by position or by matching text, so an edit made against a read that
// is a second old still lands on the block it was meant for.
//
// BlockNote stores a document as a `blockGroup` of `blockContainer`
// elements, each carrying its block's id, its content, and an optional
// nested `blockGroup` of children. A row of columns is a `columnList` in
// the same place, holding `column`s that each hold containers. Edits here
// insert and remove whole containers and leave every other one alone, so
// they merge with what people are typing elsewhere in the document.

type Container = Y.XmlElement

const isElement = (node: unknown, name: string): node is Y.XmlElement =>
  node instanceof Y.XmlElement && node.nodeName.toLowerCase() === name

// What a group holds: blocks, and rows of columns, each with its own id.
const isBlock = (node: unknown): node is Container => isElement(node, "blockcontainer") || isElement(node, "columnlist")

function topGroup(doc: Y.Doc) {
  const first = doc.getXmlFragment(TEXT_FRAGMENT).get(0)
  return isElement(first, "blockgroup") ? first : null
}

const containersOf = (group: Y.XmlElement) => group.toArray().filter(isBlock)

// The groups directly inside a block: its nested children, or its columns.
const innerGroupsOf = (block: Container) =>
  block.toArray().filter((node): node is Y.XmlElement => isElement(node, "blockgroup") || isElement(node, "column"))

function findContainer(
  group: Y.XmlElement,
  blockId: string
): { group: Y.XmlElement; index: number; container: Container } | null {
  const children = group.toArray()
  for (let index = 0; index < children.length; index++) {
    const container = children[index]
    if (!isBlock(container)) continue
    if (container.getAttribute("id") === blockId) return { group, index, container }
    for (const inner of innerGroupsOf(container)) {
      const found = findContainer(inner, blockId)
      if (found) return found
    }
  }
  return null
}

// A column cannot be empty, and a row needs two columns. When a deletion
// empties a column, the column goes; when that leaves one column, its
// blocks take the row's place.
function tidyColumn(column: Y.XmlElement) {
  const row = column.parent
  if (column.length > 0 || !(row instanceof Y.XmlElement) || !isElement(row, "columnlist")) return
  row.delete(row.toArray().indexOf(column), 1)
  const [last, ...others] = row.toArray()
  if (others.length || !isElement(last, "column")) return
  const outer = row.parent
  if (!(outer instanceof Y.XmlElement)) return
  const at = outer.toArray().indexOf(row)
  const blocks = last.toArray().map((node) => (node as Y.XmlElement).clone())
  outer.delete(at, 1)
  outer.insert(at, blocks)
}

// A container with nothing typed in it: what a new document opens with.
function isEmptyParagraph(container: Container) {
  const [content, ...rest] = container.toArray()
  return !rest.length && isElement(content, "paragraph") && content.length === 0
}

// Fresh containers for some blocks, ready to be inserted into any document.
// BlockNote's own converter builds them in a scratch document, so they are
// exactly what the editor would have made.
function containersFor(blocks: ServerBlocks) {
  const scratch = new Y.Doc()
  serverEditor.blocksToYXmlFragment(blocks, scratch.getXmlFragment(TEXT_FRAGMENT))
  const group = topGroup(scratch)
  return group ? containersOf(group).map((container) => container.clone()) : []
}

const idsOf = (containers: Container[]) =>
  containers.map((container) => container.getAttribute("id") ?? "")

export type ReadBlock = { id: string; type: string; markdown: string }

// The document's top-level blocks, each as Markdown. A block's nested
// children (an indented list under a list item) are part of its Markdown.
export async function readBlocks(doc: Y.Doc): Promise<ReadBlock[]> {
  const blocks = serverEditor.yXmlFragmentToBlocks(doc.getXmlFragment(TEXT_FRAGMENT))
  return Promise.all(
    blocks.map(async (block) => ({ id: block.id, type: block.type, markdown: await blockToMarkdown(block) }))
  )
}

export { parseMarkdown } from "./markdown"

export type BlockEdit =
  | { kind: "append"; blocks: ServerBlocks }
  | { kind: "insert-after"; blockId: string; blocks: ServerBlocks }
  | { kind: "replace"; blockId: string; blocks: ServerBlocks }
  | { kind: "delete"; blockId: string }

export const NO_BLOCK =
  "No block with that id. It may have been deleted; read the document again for current ids."

// Applies one edit inside the caller's transaction. Returns the ids of the
// blocks it added, or an error when the block it names is not there.
export function applyBlockEdit(doc: Y.Doc, edit: BlockEdit): { added: string[] } | { error: string } {
  const group = topGroup(doc)

  if (edit.kind === "append") {
    // A document nobody has opened yet has no structure at all.
    if (!group) {
      serverEditor.blocksToYXmlFragment(edit.blocks, doc.getXmlFragment(TEXT_FRAGMENT))
      const written = topGroup(doc)
      return { added: written ? idsOf(containersOf(written)) : [] }
    }
    const added = containersFor(edit.blocks)
    const existing = containersOf(group)
    // The empty paragraph a new document opens with is a placeholder, not
    // content to keep above what is being written.
    if (added.length && existing.length === 1 && isEmptyParagraph(existing[0]))
      group.delete(0, group.length)
    group.insert(group.length, added)
    return { added: idsOf(added) }
  }

  const found = group && findContainer(group, edit.blockId)
  if (!found) return { error: NO_BLOCK }

  if (edit.kind === "delete") {
    const last = found.group === group && containersOf(group).length === 1
    found.group.delete(found.index, 1)
    // The editor cannot show a document with no blocks, and a nested group
    // cannot be empty either.
    if (last) found.group.insert(0, containersFor([{ type: "paragraph" }] as ServerBlocks))
    else if (found.group.nodeName.toLowerCase() === "column") tidyColumn(found.group)
    else if (found.group.length === 0 && found.group.parent instanceof Y.XmlElement)
      found.group.parent.delete(found.group.parent.toArray().indexOf(found.group), 1)
    return { added: [] }
  }

  const added = containersFor(edit.blocks)
  if (edit.kind === "replace" && !added.length)
    return { error: "The replacement is empty. Use delete_block to remove a block." }
  found.group.insert(found.index + 1, added)
  if (edit.kind === "replace") found.group.delete(found.index, 1)
  return { added: idsOf(added) }
}
