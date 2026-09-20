import type { ToolContext } from "./tool"

// Tools take ids. These find the row behind one, through the caller's
// client, so something the caller may not see is simply not found.

const DOCUMENT_COLUMNS =
  "id, org_id, project_id, type, kind, title, folder_id, parent_document_id, parent_object_id, deleted_at, source"

export async function findDocument({ supabase }: ToolContext, documentId: string) {
  const { data } = await supabase
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .eq("id", documentId)
    .maybeSingle()
  return data
}

export const NO_DOCUMENT = { error: "No such document, or you do not have access to it." }
export const NO_PROJECT = { error: "No such project, or you do not have access to it." }
export const NO_ORG = { error: "No such org, or you are not a member of it." }

export async function findTypedDocument(
  context: ToolContext,
  documentId: string,
  type: "text" | "whiteboard"
) {
  const document = await findDocument(context, documentId)
  if (!document) return NO_DOCUMENT
  if (document.type !== type)
    return {
      error:
        type === "text"
          ? "That document is a whiteboard. Use the whiteboard tools on it."
          : "That document is a text document. Use the text document tools on it.",
    }
  return document
}

export async function findProject({ supabase }: ToolContext, projectId: string) {
  const { data } = await supabase
    .from("projects")
    .select("id, org_id, name, visibility, source, created_at")
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
