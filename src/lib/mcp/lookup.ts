import { codeFromSegment, documentHref, projectHref } from "@/lib/navigation"

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
    .select("id, org_id, slug, name, visibility, taken_down_at, source, created_at")
    .eq("id", projectId)
    .maybeSingle()
  return data
}

export async function orgSlug({ supabase }: ToolContext, orgId: string) {
  const { data } = await supabase.from("orgs").select("slug").eq("id", orgId).maybeSingle()
  return data?.slug ?? null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// What a web app address names (lib/navigation.ts): a project, and the
// whiteboard or page in it when there is one. Takes the readable addresses,
// /<workspace>/<project>[/<title>-<code>], and the older ones by id,
// /p/<project id>[/d/<document id>] and /<workspace>/<project>/d/<document id>.
// Null when it names nothing the caller can see.
export async function resolveAddress(context: ToolContext, address: string) {
  let parts: string[]
  try {
    parts = new URL(address.trim(), "http://address.invalid").pathname.split("/").filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
  const byId = parts[2] === "d" && UUID.test(parts[3] ?? "") ? parts[3] : null

  let projectId: string
  let documentId: string | null = byId
  if (parts[0] === "p" && UUID.test(parts[1] ?? "")) projectId = parts[1]
  else if (parts.length >= 2) {
    const { data: found } = await context.supabase
      .rpc("find_project", { p_workspace: parts[0], p_project: parts[1] })
      .maybeSingle()
    if (!found) return null
    projectId = found.project_id
    if (!byId && parts[2] && parts[2] !== "trash") {
      const code = codeFromSegment(parts[2])
      if (!code) return null
      const { data: row } = await context.supabase
        .from("documents")
        .select("id")
        .eq("project_id", projectId)
        .eq("code", code)
        .maybeSingle()
      if (!row) return null
      documentId = row.id
    }
  } else return null

  const project = await findProject(context, projectId)
  if (!project) return null
  const document = documentId ? await findDocument(context, documentId) : null
  if (documentId && (!document || document.project_id !== project.id)) return null
  return { project, document }
}

// The address of a project in the web app, for a person to open
// (lib/navigation.ts).
export async function projectUrl(context: ToolContext, project: { org_id: string; slug: string }) {
  const slug = await orgSlug(context, project.org_id)
  return slug ? `${context.origin}${projectHref({ slug, project: project.slug })}` : null
}

// The same for a document.
export async function documentUrl(
  context: ToolContext,
  document: { id: string; org_id: string; project_id: string }
) {
  const [slug, { data }] = await Promise.all([
    orgSlug(context, document.org_id),
    context.supabase.from("documents").select("code, title, project:projects(slug)").eq("id", document.id).maybeSingle(),
  ])
  if (!slug || !data?.project) return null
  return `${context.origin}${documentHref({ slug, project: data.project.slug }, data)}`
}
