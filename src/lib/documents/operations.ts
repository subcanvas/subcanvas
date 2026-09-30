import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { loadDocument } from "@/lib/sync/server-document"
import type { Container, DocumentType } from "@/lib/tree"
import { edgesMap, nodesMap } from "@/lib/whiteboard/schema"

import { listMedia, removeMedia } from "./media-cleanup"
import { fail, NOT_ALLOWED, type OperationResult } from "./result"

// What can be done to a project's folders and documents, as plain functions
// over the caller's Supabase client. The server actions and the MCP tools
// both call these, so a person and an agent get the same checks and the same
// messages.
//
// Authorization is RLS. A write that a policy filters out changes no rows,
// which is reported as "not allowed".

type Client = SupabaseClient<Database>

export type ProjectScope = { orgId: string; projectId: string }
export { fail, NOT_ALLOWED, type OperationResult }

// Things inside a project are folders and documents. Either goes to the
// trash and comes back from it with everything inside it; only from the
// trash is it deleted for good.
export type ItemKind = "folder" | "document"

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

// The titles of documents in view that link to this one, for the warning
// shown before it is trashed or deleted (R1.8). For a folder, those that
// link from outside it to anything inside it.
export async function listReferences(supabase: Client, id: string, kind: ItemKind = "document"): Promise<string[]> {
  const { data } =
    kind === "folder"
      ? await supabase.rpc("folder_references", { p_folder_id: id })
      : await supabase.rpc("document_references", { p_document_id: id })
  return (data ?? []).map((row) => row.source_title)
}

export async function trashItem(supabase: Client, kind: ItemKind, id: string): Promise<OperationResult> {
  const deletedAt = { deleted_at: new Date().toISOString() }
  const { data, error } =
    kind === "folder"
      ? await supabase.from("folders").update(deletedAt).eq("id", id).select("id")
      : await supabase.from("documents").update(deletedAt).eq("id", id).select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED
  return { ok: true }
}

// Asked to restore something that is not in the trash itself. It may be out
// of view inside something that is, which is what comes back.
const NOT_IN_TRASH = {
  error:
    "That is not in the trash itself. If it is inside a folder or document that is, restore that one: what is inside comes back with it.",
}

// Where a restored item went: back where it was; to the top of the project,
// because what it was in is still in the trash; or, for a document that a
// whiteboard object held, under that whiteboard, because the object is gone.
export type Restored = { restoredTo: "place" | "top" | "whiteboard" }

export async function restoreItem(
  supabase: Client,
  kind: ItemKind,
  id: string
): Promise<OperationResult<Restored>> {
  if (kind === "folder") {
    const { data: folder } = await supabase
      .from("folders")
      .select("parent_folder_id, deleted_at")
      .eq("id", id)
      .maybeSingle()
    if (!folder) return NOT_ALLOWED
    if (!folder.deleted_at) return NOT_IN_TRASH
    const { data, error } = await supabase.rpc("restore_folder", { p_folder_id: id })
    if (error) return fail(error)
    if (!data.length) return NOT_ALLOWED
    return { ok: true, restoredTo: folder.parent_folder_id && !data[0].parent_folder_id ? "top" : "place" }
  }

  const { data: document } = await supabase
    .from("documents")
    .select("parent_document_id, parent_object_id, folder_id, deleted_at")
    .eq("id", id)
    .maybeSingle()
  if (!document) return NOT_ALLOWED
  if (!document.deleted_at) return NOT_IN_TRASH
  const objectGone =
    document.parent_document_id && document.parent_object_id
      ? !(await objectHolds(supabase, document.parent_document_id, document.parent_object_id, id))
      : false

  const { data, error } = await supabase.rpc("restore_document", { p_document_id: id, p_object_gone: objectGone })
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED
  const [back] = data
  const top =
    (document.parent_document_id && !back.parent_document_id) || (document.folder_id && !back.folder_id)
  return { ok: true, restoredTo: top ? "top" : objectGone ? "whiteboard" : "place" }
}

// Whether a whiteboard object still holds a document, read from the
// whiteboard as last saved. A whiteboard that cannot be read, or a parent
// that is a text document, is taken to still hold it.
async function objectHolds(supabase: Client, parentId: string, objectId: string, documentId: string) {
  const { data: parent } = await supabase.from("documents").select("type").eq("id", parentId).maybeSingle()
  if (parent?.type !== "whiteboard") return true
  const doc = await loadDocument(supabase, parentId)
  if (!doc) return true
  const object = nodesMap(doc).get(objectId) ?? edgesMap(doc).get(objectId)
  return object?.get("docId") === documentId
}

export async function deleteItemForever(supabase: Client, kind: ItemKind, id: string): Promise<OperationResult> {
  if (kind === "folder") {
    // The pictures and videos of every document in it, which the delete
    // cascades to (media-cleanup.ts).
    const { data: media } = await supabase.rpc("folder_media_objects", { p_folder_id: id })
    const { data, error } = await supabase
      .from("folders")
      .delete()
      .eq("id", id)
      .not("deleted_at", "is", null)
      .select("id")
    if (error) return fail(error)
    if (!data.length) return NOT_ALLOWED
    await removeMedia(supabase, media ?? [])
    return { ok: true }
  }

  // The pictures and videos on it, and on the documents inside it, which the
  // delete cascades to (media-cleanup.ts).
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
  if (error) return error.code === "42501" ? { error: ONLY_ADMINS_CHANGE_VISIBILITY } : fail(error)
  if (!data.length) return NOT_ALLOWED
  return { ok: true }
}

// Making a project public, at creation or later, takes an admin (owners
// are admins too). The database says so on every path; these are its words.
export const ONLY_ADMINS_PUBLISH = "Only an admin can make a project public."
export const ONLY_ADMINS_CHANGE_VISIBILITY = "Only an admin can change who can see a project."

// The same limit as the table's check.
const MAX_PROJECT_NAME = 120

export async function renameProject(supabase: Client, projectId: string, name: string): Promise<OperationResult> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > MAX_PROJECT_NAME)
    return { error: `A project name is 1 to ${MAX_PROJECT_NAME} characters.` }

  const { data, error } = await supabase.from("projects").update({ name: trimmed }).eq("id", projectId).select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED
  return { ok: true }
}

// For good, with everything in it: RLS lets admins do it, and the rows go by
// cascade. `confirmation` is the project's name as the person typed it,
// checked here as well as in the dialog, so nothing but a deliberate request
// deletes. Its pictures and videos are named <org>/<project>/<document>/…
// and go after the rows (media-cleanup.ts says why in that order).
export async function deleteProject(
  supabase: Client,
  projectId: string,
  confirmation: string
): Promise<OperationResult> {
  const { data: project } = await supabase.from("projects").select("org_id, name").eq("id", projectId).maybeSingle()
  if (!project) return NOT_ALLOWED
  if (confirmation.trim() !== project.name) return { error: "That is not the project's name." }

  const media = (await listMedia(supabase, project.org_id)).filter((file) => file.name.split("/")[1] === projectId)
  const { data, error } = await supabase.from("projects").delete().eq("id", projectId).select("id")
  if (error) return fail(error)
  if (!data.length) return NOT_ALLOWED
  await removeMedia(supabase, media)
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
  if (error) return { error: projectRefusal(error, visibility) }
  return { ok: true, id: data.id }
}

// Why a new project was refused. The database checks who may make one
// public before it checks who may make one at all, so a refusal of a public
// project says the first.
export function projectRefusal(error: { code?: string; message: string }, visibility: "private" | "public") {
  if (error.code !== "42501") return error.message
  return visibility === "public" ? ONLY_ADMINS_PUBLISH : "You do not have permission to create projects."
}
