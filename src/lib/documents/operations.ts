import type { SupabaseClient } from "@supabase/supabase-js"

import { limitMessage } from "@/lib/billing/limit"
import type { Database } from "@/lib/supabase/database.types"
import type { Container, DocumentType } from "@/lib/tree"

import { listMedia, removeMedia } from "./media-cleanup"

// What can be done to a project's folders and documents, as plain functions
// over the caller's Supabase client. The server actions and the MCP tools
// both call these, so a person and an agent get the same checks and the same
// messages.
//
// Authorization is RLS. A write that a policy filters out changes no rows,
// which is reported as "not allowed".

type Client = SupabaseClient<Database>

export type ProjectScope = { orgId: string; projectId: string }
// `limit` marks the free-tier limit, so the caller can offer the upgrade.
export type OperationResult<T = object> = { error: string; limit?: true } | ({ ok: true } & T)

export const NOT_ALLOWED = { error: "You do not have permission to do that." }

export function fail(error: { code?: string; message: string }): { error: string; limit?: true } {
  const limit = limitMessage(error.code)
  if (limit) return { error: limit, limit: true }
  return error.code === "42501" ? NOT_ALLOWED : { error: error.message }
}

// New items go after their siblings.
function nextPosition() {
  return Date.now()
}

export async function createFolder(
  supabase: Client,
  project: ProjectScope,
  parentFolderId: string | null,
  name = "New folder"
): Promise<OperationResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("folders")
    .insert({
      org_id: project.orgId,
      project_id: project.projectId,
      parent_folder_id: parentFolderId,
      name,
      position: nextPosition(),
    })
    .select("id")
    .single()
  if (error) return fail(error)
  return { ok: true, id: data.id }
}

export async function createDocument(
  supabase: Client,
  project: ProjectScope,
  userId: string | undefined,
  type: DocumentType,
  container: Container,
  title?: string
): Promise<OperationResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      org_id: project.orgId,
      project_id: project.projectId,
      type,
      folder_id: container.kind === "folder" ? container.id : null,
      parent_document_id: container.kind === "document" ? container.id : null,
      position: nextPosition(),
      created_by: userId,
      // Left out, the database's own default title applies.
      ...(title ? { title } : {}),
    })
    .select("id")
    .single()
  if (error) return fail(error)
  return { ok: true, id: data.id }
}

// Many folders and text documents at once, for an import. The caller chose
// the ids, so that what it sends can already refer to them; a parent has to
// come before what it holds. Each call is one statement: at a plan limit,
// or without permission, none of its rows are made.
export async function createFolders(
  supabase: Client,
  project: ProjectScope,
  folders: { id: string; name: string; parentFolderId: string | null }[]
): Promise<OperationResult> {
  if (!folders.length) return { ok: true }
  const first = nextPosition()
  const { error } = await supabase.from("folders").insert(
    folders.map((folder, index) => ({
      id: folder.id,
      org_id: project.orgId,
      project_id: project.projectId,
      parent_folder_id: folder.parentFolderId,
      name: folder.name,
      position: first + index,
    }))
  )
  return error ? fail(error) : { ok: true }
}

export async function createTextDocuments(
  supabase: Client,
  project: ProjectScope,
  userId: string | undefined,
  documents: { id: string; title: string; container: Container }[]
): Promise<OperationResult> {
  if (!documents.length) return { ok: true }
  const first = nextPosition()
  const { error } = await supabase.from("documents").insert(
    documents.map(({ id, title, container }, index) => ({
      id,
      org_id: project.orgId,
      project_id: project.projectId,
      type: "text" as const,
      title,
      folder_id: container.kind === "folder" ? container.id : null,
      parent_document_id: container.kind === "document" ? container.id : null,
      position: first + index,
      created_by: userId,
    }))
  )
  return error ? fail(error) : { ok: true }
}

export async function renameItem(
  supabase: Client,
  kind: "folder" | "document",
  id: string,
  name: string
): Promise<OperationResult> {
  const trimmed = name.trim()
  if (!trimmed) return { error: "Enter a name." }

  const { data, error } =
    kind === "folder"
      ? await supabase.from("folders").update({ name: trimmed }).eq("id", id).select("id")
      : await supabase.from("documents").update({ title: trimmed }).eq("id", id).select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED
  return { ok: true }
}

export async function moveItem(
  supabase: Client,
  kind: "folder" | "document",
  id: string,
  target: Container
): Promise<OperationResult> {
  if (kind === "folder" && target.kind === "document")
    return { error: "A folder cannot go inside a document." }
  if (target.kind !== "root" && target.id === id)
    return { error: "An item cannot be moved inside itself." }

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
  return { ok: true }
}

// The titles of documents that link to this one, for the warning shown
// before it is trashed or deleted (R1.8).
export async function listReferences(supabase: Client, id: string): Promise<string[]> {
  const { data } = await supabase.rpc("document_references", { p_document_id: id })
  return (data ?? []).map((row) => row.source_title)
}

export async function trashDocument(supabase: Client, id: string): Promise<OperationResult> {
  const { data, error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED
  return { ok: true }
}

export async function restoreDocument(supabase: Client, id: string): Promise<OperationResult> {
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
  return { ok: true }
}

export async function deleteDocumentForever(supabase: Client, id: string): Promise<OperationResult> {
  // The pictures and videos on it, and on the whiteboards inside it, which
  // the delete cascades to (media-cleanup.ts).
  const { data: doomed } = await supabase.from("documents").select("org_id").eq("id", id).maybeSingle()
  const media = doomed ? await listMedia(supabase, doomed.org_id, id) : []

  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED
  await removeMedia(supabase, media)
  return { ok: true }
}

export async function deleteFolder(supabase: Client, id: string): Promise<OperationResult> {
  const { error } = await supabase.rpc("delete_folder", { p_folder_id: id })
  if (error) return fail(error)
  return { ok: true }
}

export async function setProjectVisibility(
  supabase: Client,
  projectId: string,
  visibility: "private" | "public"
): Promise<OperationResult> {
  const { data, error } = await supabase
    .from("projects")
    .update({ visibility })
    .eq("id", projectId)
    .select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED
  return { ok: true }
}

export async function createProject(
  supabase: Client,
  { orgId, userId, name, visibility }: {
    orgId: string
    userId: string | undefined
    name: string
    visibility: "private" | "public"
  }
): Promise<OperationResult<{ id: string }>> {
  const trimmed = name.trim()
  if (!trimmed) return { error: "Enter a project name." }

  const { data, error } = await supabase
    .from("projects")
    .insert({ org_id: orgId, name: trimmed, visibility, created_by: userId })
    .select("id")
    .single()
  if (error)
    return {
      error:
        error.code === "42501" ? "You do not have permission to create projects." : error.message,
    }
  return { ok: true, id: data.id }
}
