import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { recordStep } from "@/lib/activity"
import { privateDocumentLimitMessage } from "@/lib/billing/limit"
import * as operations from "@/lib/documents/operations"
import { readOrgAccess } from "@/lib/org-access"
import type { Database } from "@/lib/supabase/database.types"
import { writeNewDocuments } from "@/lib/sync/server-document"
import { applyBlockEdit, parseMarkdown } from "@/lib/text/blocks"
import { serverEditor, type ServerBlocks } from "@/lib/text/server-editor"
import { mediaDocumentId, mediaTypeOf, parseMediaPath } from "@/lib/whiteboard/media"
import type { Container } from "@/lib/tree"

import type { ImportBatch } from "./batches"
import { MAX_BATCH_DOCUMENTS, MAX_FILE_BYTES } from "./limits"
import type { PlannedParent } from "./plan"

// The server's half of an import: one planned batch becomes folders and
// text documents. The web app's action and the MCP tool both end here, so a
// person and an agent meet the same checks.

type Client = SupabaseClient<Database>

const id = z.string().uuid()
const folderParent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("target") }),
  z.object({ kind: z.literal("folder"), id }),
])
const name = z.string().trim().min(1).max(200)

// A batch arrives from a browser, so it is checked like any other input.
export const batchSchema = z.object({
  folders: z.array(z.object({ id, name, parent: folderParent })).max(1000),
  documents: z
    .array(
      z.object({
        id,
        path: z.string().max(2000).nullable(),
        title: name,
        parent: z.discriminatedUnion("kind", [...folderParent.options, z.object({ kind: z.literal("document"), id })]),
        markdown: z.string().max(MAX_FILE_BYTES * 2),
        html: z.string().max(MAX_FILE_BYTES * 2).optional(),
      })
    )
    .min(1)
    .max(MAX_BATCH_DOCUMENTS),
})

// Whether this many documents can be added, asked before the first one is,
// so that an org near the free plan's limit is told at the start and is not
// left with half of its pages.
export async function checkImportAllowance(
  supabase: Client,
  userId: string,
  project: operations.ProjectScope,
  documents: number
): Promise<operations.OperationResult> {
  const access = await readOrgAccess(supabase, userId, project.orgId)
  if (!access?.canEdit) return operations.NOT_ALLOWED
  const { data: row } = await supabase.from("projects").select("visibility").eq("id", project.projectId).maybeSingle()
  if (!row) return operations.NOT_ALLOWED

  const { plan } = access
  // Public documents are unlimited, and so is everything on a paid plan.
  if (row.visibility !== "private" || !plan || plan.paid || plan.private_document_limit === null) return { ok: true }
  const room = Math.max(0, plan.private_document_limit - plan.private_documents)
  if (documents <= room) return { ok: true }
  // The limit said as every other refusal says it (lib/billing/limit.ts),
  // then what is particular to an import.
  return {
    error: `${privateDocumentLimitMessage(plan.private_document_limit)} This import is ${documents} ${documents === 1 ? "document" : "documents"}, and there is ${room === 0 ? "no room for more" : `room for ${room} more`}. Import fewer files, or into a public project.`,
    limit: true,
  }
}

type Rewritable = { type: string; content?: unknown; children?: Rewritable[] }

// The converter keeps the space that follows `>` on the later lines of a
// quote, which shows as a ragged left edge. The line break and the space
// may be in two pieces of text, when the styling changes between them.
function tidy(blocks: Rewritable[]) {
  for (const block of blocks) {
    if (block.type === "quote" && Array.isArray(block.content)) {
      let afterBreak = false
      for (const piece of block.content) {
        if (typeof piece !== "object" || piece === null || !("text" in piece) || typeof piece.text !== "string") {
          afterBreak = false
          continue
        }
        const text: string = (afterBreak ? piece.text.replace(/^ /, "") : piece.text).replace(/\n /g, "\n")
        afterBreak = text.endsWith("\n")
        piece.text = text
      }
    }
    tidy(block.children ?? [])
  }
}

export async function toBlocks(markdown: string, documentId?: string): Promise<{ blocks: ServerBlocks; plain: boolean }> {
  try {
    const blocks = videosAsVideos(keepAllowedMedia((await parseMarkdown(markdown)) as Media[], documentId)) as ServerBlocks
    tidy(blocks as Rewritable[])
    return { blocks, plain: false }
  } catch {
    // Text the converter cannot take is still the person's text.
    const blocks = markdown
      .split(/\n{2,}/)
      .map((text) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text, styles: {} }] }))
    return { blocks: blocks as ServerBlocks, plain: true }
  }
}

type Media = { type: string; props?: { url?: unknown }; children?: Media[] }
const MEDIA = new Set(["image", "video", "audio", "file"])

// A picture or file may show what is on the web, or a file of this app's
// that is filed under the document being written, which is where the
// browser uploads an import's pictures once the document exists. Anything
// else is dropped: the browser never sends it, but a request need not come
// from the browser, and a file filed under another document is read by
// that document's readers, not this one's.
function allowedMedia(url: unknown, documentId: string | undefined) {
  const address = String(url ?? "")
  if (/^https?:\/\//i.test(address)) return true
  const path = address.startsWith("/api/media/") ? parseMediaPath(address.slice("/api/media/".length)) : null
  return !!path && !!documentId && mediaDocumentId(path) === documentId
}

export function keepAllowedMedia<T extends Media>(blocks: T[], documentId?: string): T[] {
  return blocks
    .filter((block) => !MEDIA.has(block.type) || allowedMedia(block.props?.url, documentId))
    .map((block) => (block.children?.length ? { ...block, children: keepAllowedMedia(block.children, documentId) } : block))
}

// Markdown shows a picture and a video the same way, `![caption](file)`, and
// the converter makes a picture of both. A file of this app's that is a
// video is shown as one. That is how an export writes videos
// (lib/export/markdown.ts), and how other apps' Markdown embeds them.
export function videosAsVideos<T extends Media>(blocks: T[]): T[] {
  return blocks.map((block) => {
    const address = String(block.props?.url ?? "")
    const path = address.startsWith("/api/media/") ? parseMediaPath(address.slice("/api/media/".length)) : null
    const video = block.type === "image" && path !== null && mediaTypeOf(path) === "video"
    return {
      ...block,
      ...(video ? { type: "video" } : {}),
      ...(block.children?.length ? { children: videosAsVideos(block.children) } : {}),
    }
  })
}

// A page read from HTML. What the browser sent is the page cut down to what
// the editor holds, but it came over the network, so it is parsed only into
// blocks the schema knows; nothing of it is rendered as HTML.
export async function htmlToBlocks(html: string, documentId?: string): Promise<{ blocks: ServerBlocks; plain: boolean }> {
  try {
    const blocks = keepAllowedMedia((await serverEditor.tryParseHTMLToBlocks(html)) as Media[], documentId) as ServerBlocks
    tidy(blocks as Rewritable[])
    return { blocks, plain: false }
  } catch {
    const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ")
    return toBlocks(text)
  }
}

export async function writeImportBatch(
  supabase: Client,
  project: operations.ProjectScope,
  userId: string,
  target: Container,
  batch: ImportBatch
): Promise<operations.OperationResult<{ plainText: string[] }>> {
  const place = (parent: PlannedParent): Container => (parent.kind === "target" ? target : parent)

  // Converted before anything is made, so that a failure here leaves nothing.
  // One at a time: the converter borrows the process's DOM globals while it runs.
  const contents: Parameters<typeof writeNewDocuments>[1] = []
  const plainText: string[] = []
  for (const document of batch.documents) {
    if (!document.markdown.trim() && !document.html?.trim()) continue
    const { blocks, plain } = document.html
      ? await htmlToBlocks(document.html, document.id)
      : await toBlocks(document.markdown, document.id)
    if (plain) plainText.push(document.title)
    if (blocks.length)
      contents.push({ documentId: document.id, change: (doc) => void applyBlockEdit(doc, { kind: "append", blocks }) })
  }

  const folders = await operations.createFolders(
    supabase,
    project,
    batch.folders.map((folder) => {
      const parent = place(folder.parent)
      return { id: folder.id, name: folder.name, parentFolderId: parent.kind === "folder" ? parent.id : null }
    })
  )
  if ("error" in folders) return folders

  const created = await operations.createTextDocuments(
    supabase,
    project,
    userId,
    batch.documents.map((document) => ({ id: document.id, title: document.title, container: place(document.parent) }))
  )
  if ("error" in created) {
    // The folders were made for these documents a moment ago, and none of
    // them was: they hold nothing, and go.
    if (batch.folders.length)
      await supabase
        .from("folders")
        .delete()
        .in("id", batch.folders.map((folder) => folder.id))
    return created
  }

  const written = await writeNewDocuments(supabase, contents)
  if (written.error) {
    // A document with a title and no text is worse than one that is
    // missing and known to be: these go to the trash.
    await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", batch.documents.map((document) => document.id))
    return { error: written.error }
  }
  await recordStep(supabase, "imported_files")
  return { ok: true, plainText }
}
