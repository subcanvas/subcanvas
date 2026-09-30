import type { ToolContext } from "./tool"

// Tools take ids. These find the row behind one, through the caller's
// client, so something the caller may not see is simply not found.

const DOCUMENT_COLUMNS =
  "id, org_id, project_id, type, kind, title, folder_id, parent_document_id, parent_object_id, deleted_at, source"

// `in_trash` is whether it is out of view: in the trash, or inside a
// document or folder that is, which the app treats the same way.
export async function findDocument({ supabase }: ToolContext, documentId: string) {
  const [{ data }, { data: live }] = await Promise.all([
    supabase.from("documents").select(DOCUMENT_COLUMNS).eq("id", documentId).maybeSingle(),
    supabase.rpc("document_is_live", { p_document_id: documentId }),
  ])
  return data && { ...data, in_trash: live !== true }
}

export const NO_DOCUMENT = { error: "No such document, or you do not have access to it." }
export const IN_TRASH = {
  error:
    "That document is in the trash, or inside a folder or document that is. Restore it first: `get_project` with `include_trash` lists what can be restored.",
}
// Said beside what a read returns about a document that is out of view.
export const READ_FROM_TRASH =
  "This document is in the trash, or inside a folder or document that is: people do not see it in the project until it is restored."
export const NO_PROJECT = { error: "No such project, or you do not have access to it." }
export const NO_ORG = { error: "No such workspace, or you are not a member of it." }

// For a change, unless `read` says the caller only reads it: what is in the
// trash is refused.
export async function findTypedDocument(
  context: ToolContext,
  documentId: string,
  type: "text" | "whiteboard",
  { read = false }: { read?: boolean } = {}
) {
  const document = await findDocument(context, documentId)
  if (!document) return NO_DOCUMENT
  if (document.type !== type)
    return {
      error:
        type === "text"
          ? "That document is a whiteboard. Use the whiteboard tools on it."
          : "That document is a page. Use the page tools (`read_text_document` and the block tools) on it.",
    }
  if (document.in_trash && !read) return IN_TRASH
  return document
}

export async function findProject({ supabase }: ToolContext, projectId: string) {
  const { data } = await supabase
    .from("projects")
    .select("id, org_id, name, visibility, taken_down_at, source, created_at")
    .eq("id", projectId)
    .maybeSingle()
  return data
}

export async function orgSlug({ supabase }: ToolContext, orgId: string) {
  const { data } = await supabase.from("orgs").select("slug").eq("id", orgId).maybeSingle()
  return data?.slug ?? null
}

// The address of a document in the web app, for a person to open.
export async function documentUrl(
  context: ToolContext,
  document: { id: string; org_id: string; project_id: string }
) {
  const slug = await orgSlug(context, document.org_id)
  return slug ? `${context.origin}/${slug}/${document.project_id}/d/${document.id}` : null
}
