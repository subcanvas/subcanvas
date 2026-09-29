import "server-only"

import type * as Y from "yjs"

import { TEXT_FRAGMENT } from "@/lib/sync/text-fragment"
import { blockToMarkdown } from "@/lib/text/markdown"
import { serverEditor, type ServerBlocks } from "@/lib/text/server-editor"
import { parseMediaPath } from "@/lib/whiteboard/media"

// A text document as a Markdown file, for a download or a project's export
// (docs/EXPORTING.md). The blocks are written the way the MCP tools read and
// write them (lib/text/markdown.ts), so Import files and `append_markdown`
// take the file back. Three things a file needs that a tool call does not:
//
// - The title, as the heading the file opens with, which is where Import
//   files looks for it.
// - Addresses that work outside the app. A link to a page of the app and a
//   picture's lasting address (`/api/media/…`) are relative to the app, so
//   they are written out in full. An export then points those that are in
//   the zip at their files instead (lib/export/zip.ts); each address it may
//   replace is returned beside the text.
// - A document card, which Markdown has no syntax for, becomes a link to the
//   document on a line of its own.

type Block = { id?: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: Block[] }

// A document a text links to, as the reader can see it. Null when they
// cannot: it was deleted for good, or it is not theirs to read.
export type LinkedDocument = { title: string; url: string } | null

// A picture or video the text shows, filed in Storage under `path`.
// `url` is the address written for it, and `name` what it is called.
export type ExportedMedia = { path: string; url: string; name: string }

export type ExportedMarkdown = {
  markdown: string
  media: ExportedMedia[]
  // The address written for each document the text links to.
  links: Record<string, string>
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
// A document's page in the app: /<org>/<project>/d/<document>, or the public
// /p/<project>/d/<document>, maybe with a trail (`?via=`) after it.
const DOCUMENT_PAGE = new RegExp(`^/[^/?#]+/${UUID}/d/(${UUID})(?:[?#].*)?$`, "i")
const MEDIA_ADDRESS = "/api/media/"
const MEDIA_BLOCKS = new Set(["image", "video", "audio", "file"])

// What a card says for a document the reader cannot open, as the editor says it.
export const MISSING_DOCUMENT = "This document was deleted, or you do not have access to it."

export function readTextBlocks(doc: Y.Doc): Block[] {
  return serverEditor.yXmlFragmentToBlocks(doc.getXmlFragment(TEXT_FRAGMENT)) as Block[]
}

// A path on this app's own site, from an address written in a document.
function ownPath(href: string, origin: string) {
  if (href.startsWith("/") && !href.startsWith("//")) return href
  if (href.startsWith(`${origin}/`)) return href.slice(origin.length)
  return null
}

const documentIdOf = (href: string, origin: string) => {
  const path = ownPath(href, origin)
  return path ? (DOCUMENT_PAGE.exec(path)?.[1].toLowerCase() ?? null) : null
}

// Every inline link in a block's content, which may be a table's rows.
function forEachLink(content: unknown, visit: (link: { href: string }) => void) {
  if (Array.isArray(content)) for (const item of content) forEachLink(item, visit)
  else if (content && typeof content === "object") {
    const item = content as Record<string, unknown>
    if (item.type === "link" && typeof item.href === "string") visit(item as { href: string })
    for (const value of Object.values(item)) if (value && typeof value === "object") forEachLink(value, visit)
  }
}

function forEachBlock(blocks: Block[], visit: (block: Block) => void) {
  for (const block of blocks) {
    visit(block)
    forEachBlock(block.children ?? [], visit)
  }
}

// The ids of the documents a text links to, by card or by link, so they can
// be looked up in one go.
export function linkedDocumentIds(blocks: Block[], origin: string) {
  const ids = new Set<string>()
  forEachBlock(blocks, (block) => {
    if (block.type === "documentLink" && typeof block.props?.docId === "string" && block.props.docId)
      ids.add(block.props.docId.toLowerCase())
    forEachLink(block.content, (link) => {
      const id = documentIdOf(link.href, origin)
      if (id) ids.add(id)
    })
  })
  return [...ids]
}

// A title as the heading a file opens with, escaped so that Import files
// reads back the same words (lib/import/markdown-file.ts).
export function markdownTitle(title: string) {
  return (title.replace(/\s+/g, " ").trim() || "Untitled")
    .replace(/[\\`*_~[\]<]/g, "\\$&")
    .replace(/(\s)(#+)$/, (_, space: string, hashes: string) => space + hashes.replace(/#/g, "\\#"))
}

const text = (value: string) => ({ type: "text", text: value, styles: {} })

export async function exportMarkdown(
  blocks: Block[],
  { title, origin, documents }: { title: string; origin: string; documents: Map<string, LinkedDocument> }
): Promise<ExportedMarkdown> {
  const media = new Map<string, ExportedMedia>()
  const links: Record<string, string> = {}

  const address = (href: string) => {
    const id = documentIdOf(href, origin)
    const linked = id ? documents.get(id) : null
    if (id && linked) {
      links[id] = linked.url
      return linked.url
    }
    const path = ownPath(href, origin)
    return path ? `${origin}${path}` : href
  }

  const rewrite = (list: Block[]): Block[] =>
    list.map((original) => {
      const block: Block = structuredClone({ ...original, children: [] })
      const children = rewrite(original.children ?? [])

      if (block.type === "documentLink") {
        const id = String(block.props?.docId ?? "").toLowerCase()
        const linked = documents.get(id)
        if (linked) links[id] = linked.url
        return {
          type: "paragraph",
          content: linked ? [{ type: "link", href: linked.url, content: [text(linked.title || "Untitled")] }] : [text(MISSING_DOCUMENT)],
          children,
        }
      }

      if (MEDIA_BLOCKS.has(block.type) && typeof block.props?.url === "string") {
        const props = block.props
        const url = props.url as string
        const own = ownPath(url, origin)
        const path = own?.startsWith(MEDIA_ADDRESS) ? parseMediaPath(own.slice(MEDIA_ADDRESS.length)) : null
        const label = String(props.caption || props.name || "")
        if (path) {
          const written = `${origin}${MEDIA_ADDRESS}${path}`
          if (!media.has(path)) media.set(path, { path, url: written, name: label })
          props.url = written
        } else if (own) props.url = `${origin}${own}`
        // `![caption](address)`, for a picture and for a video: the form
        // Import files uploads again. BlockNote writes a caption as HTML.
        if (block.type === "image" || block.type === "video") {
          block.type = "image"
          props.name = label
          props.caption = ""
        }
      }

      forEachLink(block.content, (link) => {
        link.href = address(link.href)
      })
      return { ...block, children }
    })

  const rewritten = rewrite(blocks)
  // Runs of blocks go to BlockNote's writer together, so that a list stays
  // one list; a callout has a form of its own (lib/text/markdown.ts).
  const parts: string[] = []
  let run: Block[] = []
  const flush = async () => {
    if (run.length) parts.push(await serverEditor.blocksToMarkdownLossy(run as ServerBlocks))
    run = []
  }
  for (const block of rewritten) {
    if (block.type !== "callout") run.push(block)
    else {
      await flush()
      parts.push(await blockToMarkdown(block as ServerBlocks[number]))
    }
  }
  await flush()

  const body = parts.map((part) => part.trim()).filter(Boolean).join("\n\n")
  return {
    markdown: `# ${markdownTitle(title)}\n${body ? `\n${body}\n` : ""}`,
    media: [...media.values()],
    links,
  }
}
