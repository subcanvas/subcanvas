"use server"

import { revalidatePath } from "next/cache"

import { NOT_ALLOWED } from "@/lib/documents/operations"
import { batchSchema, checkImportAllowance, writeImportBatch } from "@/lib/import/write"
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
  if ("ok" in result) revalidatePath(`/${project.slug}/${project.projectId}`, "layout")
  return result
}
