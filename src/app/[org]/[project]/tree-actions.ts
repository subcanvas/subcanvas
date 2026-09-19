"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { LIMIT_ERROR_CODE, LIMIT_MESSAGE } from "@/lib/billing/limit"
import { createClient } from "@/lib/supabase/server"
import type { Container, DocumentType } from "@/lib/tree"

// Authorization is RLS. A write that a policy filters out changes no rows,
// which is reported as "not allowed".

export type ProjectRef = { slug: string; orgId: string; projectId: string }
// `limit` marks the free-tier limit, so the client can offer the upgrade.
export type ActionResult = { error: string; limit?: true } | { ok: true }

const NOT_ALLOWED = { error: "You do not have permission to do that." }

function fail(error: { code?: string; message: string }): ActionResult {
  if (error.code === LIMIT_ERROR_CODE) return { error: LIMIT_MESSAGE, limit: true }
  return error.code === "42501" ? NOT_ALLOWED : { error: error.message }
}

function refresh({ slug, projectId }: ProjectRef) {
  revalidatePath(`/${slug}/${projectId}`, "layout")
}

// New items go after their siblings.
function nextPosition() {
  return Date.now()
}

export async function createFolder(
  project: ProjectRef,
  parentFolderId: string | null
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("folders")
    .insert({
      org_id: project.orgId,
      project_id: project.projectId,
      parent_folder_id: parentFolderId,
      name: "New folder",
      position: nextPosition(),
    })
    .select("id")
    .single()
  if (error) return fail(error)

  refresh(project)
  return { ok: true, id: data.id }
}

export async function createDocument(
  project: ProjectRef,
  type: DocumentType,
  container: Container
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("documents")
    .insert({
      org_id: project.orgId,
      project_id: project.projectId,
      type,
      folder_id: container.kind === "folder" ? container.id : null,
      parent_document_id: container.kind === "document" ? container.id : null,
      position: nextPosition(),
      created_by: user?.id,
    })
    .select("id")
    .single()
  if (error) return fail(error)

  refresh(project)
  redirect(`/${project.slug}/${project.projectId}/d/${data.id}`)
}

export async function renameItem(
  project: ProjectRef,
  kind: "folder" | "document",
  id: string,
  name: string
): Promise<ActionResult> {
  const trimmed = name.trim()
  if (!trimmed) return { error: "Enter a name." }

  const supabase = await createClient()
  const { data, error } =
    kind === "folder"
      ? await supabase.from("folders").update({ name: trimmed }).eq("id", id).select("id")
      : await supabase.from("documents").update({ title: trimmed }).eq("id", id).select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED

  refresh(project)
  return { ok: true }
}

export async function moveItem(
  project: ProjectRef,
  kind: "folder" | "document",
  id: string,
  target: Container
): Promise<ActionResult> {
  if (kind === "folder" && target.kind === "document")
    return { error: "A folder cannot go inside a document." }
  if (target.kind !== "root" && target.id === id)
    return { error: "An item cannot be moved inside itself." }

  const supabase = await createClient()
  const { data, error } =
    kind === "folder"
      ? await supabase
          .from("folders")
          .update({
            parent_folder_id: target.kind === "folder" ? target.id : null,
            position: nextPosition(),
          })
          .eq("id", id)
          .select("id")
      : await supabase
          .from("documents")
          .update({
            folder_id: target.kind === "folder" ? target.id : null,
            parent_document_id: target.kind === "document" ? target.id : null,
            // The link to a whiteboard object does not survive a move.
            parent_object_id: null,
            position: nextPosition(),
          })
          .eq("id", id)
          .select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED

  refresh(project)
  return { ok: true }
}

// The titles of documents that link to this one, for the warning shown
// before it is trashed or deleted (R1.8).
export async function listReferences(id: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("document_references", { p_document_id: id })
  return (data ?? []).map((row) => row.source_title)
}

export async function trashDocument(project: ProjectRef, id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED

  refresh(project)
  return { ok: true }
}

export async function restoreDocument(project: ProjectRef, id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: document } = await supabase
    .from("documents")
    .select("parent_document_id")
    .eq("id", id)
    .maybeSingle()
  if (!document) return NOT_ALLOWED

  // If the parent is in the trash too, restore to the project root rather
  // than somewhere invisible.
  let detach = false
  if (document.parent_document_id) {
    const { data: parent } = await supabase
      .from("documents")
      .select("deleted_at")
      .eq("id", document.parent_document_id)
      .maybeSingle()
    detach = !parent || parent.deleted_at !== null
  }

  const { data, error } = await supabase
    .from("documents")
    .update({
      deleted_at: null,
      ...(detach ? { parent_document_id: null, parent_object_id: null } : {}),
    })
    .eq("id", id)
    .select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED

  refresh(project)
  return { ok: true }
}

export async function deleteDocumentForever(
  project: ProjectRef,
  id: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED

  refresh(project)
  return { ok: true }
}

export async function deleteFolder(project: ProjectRef, id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("delete_folder", { p_folder_id: id })
  if (error) return fail(error)

  refresh(project)
  return { ok: true }
}
