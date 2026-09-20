import "server-only"

import { ServerBlockNoteEditor } from "@blocknote/server-util"
import type * as Y from "yjs"

import { TEXT_FRAGMENT } from "@/lib/sync/text-fragment"

import type { Repository } from "./provider"
import { resolveReadmeUrl, stripFrontMatter } from "./readme"

// Markdown into the content of a text document, on the server. BlockNote's
// own converter does the work, so an imported README is made of exactly the
// blocks the editor would have made from the same text pasted in. It runs
// the editor headless, on jsdom.
const editor = ServerBlockNoteEditor.create()

type Blocks = Awaited<ReturnType<typeof editor.tryParseMarkdownToBlocks>>
// Only what URL rewriting touches. BlockNote's own block type is a union
// over every block with read-only props, which cannot be written through.
type Rewritable = {
  type: string
  props: Record<string, unknown>
  content?: unknown
  children: Rewritable[]
}

const EMBEDDED = ["image", "video", "audio"]

// Points relative links and images back at the repository, in place.
function resolveUrls(blocks: Rewritable[], repository: Repository, readmePath: string) {
  for (const block of blocks) {
    if (typeof block.props.url === "string" && block.props.url)
      block.props.url = resolveReadmeUrl(
        block.props.url,
        EMBEDDED.includes(block.type) ? "image" : "link",
        repository,
        readmePath
      )
    resolveLinks(block.content, (href) => resolveReadmeUrl(href, "link", repository, readmePath))
    resolveUrls(block.children, repository, readmePath)
  }
}

// A block's content is a list of inline pieces, or for a table, rows of
// cells of them. Links are found wherever they are.
function resolveLinks(content: unknown, resolve: (href: string) => string) {
  if (typeof content !== "object" || content === null) return
  if ("type" in content && content.type === "link" && "href" in content && typeof content.href === "string")
    content.href = resolve(content.href)
  for (const value of Object.values(content)) resolveLinks(value, resolve)
}

// `readmePath` is where the text came from, when it came from a file: its
// relative links and images are resolved against that folder.
export async function markdownToBlocks(
  markdown: string,
  from?: { repository: Repository; readmePath: string }
) {
  const blocks = await editor.tryParseMarkdownToBlocks(stripFrontMatter(markdown))
  if (from) resolveUrls(blocks as Rewritable[], from.repository, from.readmePath)
  return blocks
}

export function writeBlocks(doc: Y.Doc, blocks: Blocks) {
  editor.blocksToYXmlFragment(blocks, doc.getXmlFragment(TEXT_FRAGMENT))
}
