"use server"

import { revalidatePath } from "next/cache"

import { NOT_ALLOWED } from "@/lib/documents/operations"
import { batchSchema, checkImportAllowance, writeImportBatch } from "@/lib/import/write"
import { createMermaidWhiteboard, pagesSchema, writePages } from "@/lib/mermaid/write"
import { projectHref } from "@/lib/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Container } from "@/lib/tree"

import type { ActionResult, ProjectRef } from "./tree-actions"

// Importing files into a project. The browser reads and plans the files
// (lib/import) and sends the result here a batch at a time; the work on
// this side is in lib/import/write, shared with the MCP tool.

// Asked once, before the first batch.
export async function checkImport(project: ProjectRef, documents: number): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NOT_ALLOWED
  return checkImportAllowance(supabase, user.id, project, documents)
}

export async function importBatch(
  project: ProjectRef,
  target: Container,
  batch: unknown
): Promise<ActionResult & { plainText?: string[] }> {
  const parsed = batchSchema.safeParse(batch)
  if (!parsed.success) return { error: "These files could not be read as an import." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NOT_ALLOWED

  const result = await writeImportBatch(supabase, project, user.id, target, parsed.data)
  // Each batch shows up in the tree as it lands.
  if ("ok" in result) revalidatePath(projectHref(project), "layout")
  return result
}

// A Mermaid diagram as a new whiteboard (Paste Mermaid, and a page's
// Mermaid code block). The work is in lib/mermaid/write, shared with the
// MCP tool.
export async function importMermaid(
  project: ProjectRef,
  target: Container,
  text: unknown
): Promise<ActionResult & { id?: string; notes?: string[] }> {
  if (typeof text !== "string" || !text.trim()) return { error: "There is no Mermaid diagram here." }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NOT_ALLOWED

  const result = await createMermaidWhiteboard(supabase, project, user.id, target, text)
  if ("error" in result) return result
  revalidatePath(projectHref(project), "layout")
  return { ok: true, id: result.whiteboardId, notes: result.notes }
}

// The pages inside the boxes of a Mermaid diagram that is being pasted onto
// an open whiteboard (an ER diagram's attributes). The browser draws the
// boxes itself, so that undo takes them away; the pages are written here,
// where Markdown becomes a page.
export async function writeMermaidPages(
  project: ProjectRef,
  whiteboardId: string,
  pages: unknown
): Promise<ActionResult & { ids?: Record<string, string> }> {
  const parsed = pagesSchema.safeParse(pages)
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(whiteboardId)) return { error: "These pages could not be read." }
  const supabase = await createClient()
  const { data: whiteboard } = await supabase
    .from("documents")
    .select("id, type, org_id, project_id")
    .eq("id", whiteboardId)
    .maybeSingle()
  if (!whiteboard || whiteboard.type !== "whiteboard" || whiteboard.project_id !== project.projectId) return NOT_ALLOWED

  const result = await writePages(supabase, { id: whiteboard.id, orgId: whiteboard.org_id, projectId: whiteboard.project_id }, parsed.data)
  if ("error" in result) return result
  return { ok: true, ids: Object.fromEntries(result.ids) }
}
