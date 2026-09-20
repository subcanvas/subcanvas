import "server-only"

import * as Y from "yjs"

import { TEXT_FRAGMENT } from "@/lib/sync/text-fragment"

import { serverEditor, type ServerBlocks } from "./server-editor"

// Block-level reads and edits of a text document's Yjs state, for callers
// that are not an editor: the MCP server. A block is addressed by its id,
// never by position or by matching text, so an edit made against a read that
// is a second old still lands on the block it was meant for.
//
// BlockNote stores a document as a `blockGroup` of `blockContainer`
// elements, each carrying its block's id, its content, and an optional
// nested `blockGroup` of children. Edits here insert and remove whole
// containers and leave every other one alone, so they merge with what
// people are typing elsewhere in the document.

type Container = Y.XmlElement

const isElement = (node: unknown, name: string): node is Y.XmlElement =>
  node instanceof Y.XmlElement && node.nodeName.toLowerCase() === name

function topGroup(doc: Y.Doc) {
  const first = doc.getXmlFragment(TEXT_FRAGMENT).get(0)
  return isElement(first, "blockgroup") ? first : null
}

const containersOf = (group: Y.XmlElement) =>
  group.toArray().filter((node): node is Container => isElement(node, "blockcontainer"))

function findContainer(
  group: Y.XmlElement,
  blockId: string
): { group: Y.XmlElement; index: number; container: Container } | null {
  const children = group.toArray()
  for (let index = 0; index < children.length; index++) {
    const container = children[index]
    if (!isElement(container, "blockcontainer")) continue
    if (container.getAttribute("id") === blockId) return { group, index, container }
    for (const inner of container.toArray()) {
      const found = isElement(inner, "blockgroup") ? findContainer(inner, blockId) : null
      if (found) return found
    }
  }
  return null
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
    blocks.map(async (block) => ({
      id: block.id,
      type: block.type,
      markdown: (await serverEditor.blocksToMarkdownLossy([block])).trimEnd(),
    }))
  )
}

export const parseMarkdown = (markdown: string) => serverEditor.tryParseMarkdownToBlocks(markdown)

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
