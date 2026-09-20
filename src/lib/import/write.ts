import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import * as operations from "@/lib/documents/operations"
import { readOrgAccess } from "@/lib/org-access"
import type { Database } from "@/lib/supabase/database.types"
import { writeNewDocuments } from "@/lib/sync/server-document"
import { applyBlockEdit, parseMarkdown } from "@/lib/text/blocks"
import type { ServerBlocks } from "@/lib/text/server-editor"
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
      })
    )
    .min(1)
    .max(MAX_BATCH_DOCUMENTS),
})

// Whether this many documents can be added, asked before the first one is,
// so that an org near the free plan's limit is told at the start and is not
// left with half of its notes.
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
  return {
    error: `This import is ${documents} ${documents === 1 ? "document" : "documents"}, and the free plan has room for ${room} more private ${room === 1 ? "one" : "ones"}. Upgrade, make the project public, or import fewer files.`,
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

export async function toBlocks(markdown: string): Promise<{ blocks: ServerBlocks; plain: boolean }> {
  try {
    const blocks = await parseMarkdown(markdown)
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
    if (!document.markdown.trim()) continue
    const { blocks, plain } = await toBlocks(document.markdown)
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
    // The folders were made for these documents. Innermost first: only an
    // empty folder can be deleted.
    for (const folder of [...batch.folders].reverse()) await operations.deleteFolder(supabase, folder.id)
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
  return { ok: true, plainText }
}
