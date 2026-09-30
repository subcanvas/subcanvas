import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { loadDocument } from "@/lib/sync/server-document"
import { mediaHref } from "@/lib/whiteboard/media"

import { layoutExport, type ExportDocumentRow, type ExportFolderRow, type ExportLayout } from "./layout"
import { exportMarkdown, linkedDocumentIds, readTextBlocks, type ExportedMedia, type LinkedDocument } from "./markdown"
import { readWhiteboard, whiteboardSvg, type WhiteboardContents } from "./whiteboard"

// What an export reads, through the caller's own client: row-level security
// decides what they get, exactly as it does for the pages they read. A
// member of the org reads everything in the project, trash aside; a visitor
// to a public project reads what the public page shows. Nothing here uses a
// secret key.

type Client = SupabaseClient<Database>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: string) => UUID.test(value)

// The API returns at most this many rows at once (`max_rows`), and a large
// project has more.
const PAGE = 1000

async function everyRow<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error || !data) return null
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

export type ProjectExport = { project: { id: string; name: string }; layout: ExportLayout }

// The project's folders and documents, and where each goes in the zip. Null
// when the project cannot be read.
export async function readProjectLayout(supabase: Client, projectId: string): Promise<ProjectExport | null> {
  if (!isUuid(projectId)) return null
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle()
  if (!project) return null

  const [folders, documents] = await Promise.all([
    everyRow<ExportFolderRow>((from, to) =>
      supabase
        .from("folders")
        .select("id, name, parent_folder_id, position")
        .eq("project_id", project.id)
        .order("id")
        .range(from, to)
    ),
    everyRow<ExportDocumentRow & { deleted_at: string | null }>((from, to) =>
      supabase
        .from("documents")
        .select("id, title, type, kind, folder_id, parent_document_id, position, deleted_at")
        .eq("project_id", project.id)
        .order("id")
        .range(from, to)
    ),
  ])
  if (!folders || !documents) return null

  // What is in the trash stays out, and so does what is inside it.
  const layout = layoutExport(folders, documents.filter((document) => !document.deleted_at))
  return { project, layout }
}

// The title and the address in the app of each document, as the reader can
// see them. A member gets the org's own address for it; anyone else the
// public one, which works while its project is public.
export async function linkedDocuments(supabase: Client, origin: string, ids: string[]) {
  const found = new Map<string, LinkedDocument>(ids.map((id) => [id, null]))
  const wanted = ids.filter(isUuid)
  // A hundred ids at a time keeps each request's address short.
  for (let at = 0; at < wanted.length; at += 100) {
    const { data: rows } = await supabase
      .from("documents")
      .select("id, title, org_id, project_id")
      .in("id", wanted.slice(at, at + 100))
    if (!rows?.length) continue
    const { data: orgs } = await supabase
      .from("orgs")
      .select("id, slug")
      .in("id", [...new Set(rows.map((row) => row.org_id))])
    const slugs = new Map(orgs?.map((org) => [org.id, org.slug]))
    for (const row of rows)
      found.set(row.id, {
        title: row.title,
        url: `${origin}/${slugs.get(row.org_id) ?? "p"}/${row.project_id}/d/${row.id}`,
      })
  }
  return found
}

export type ExportedText = { id: string; type: "text"; title: string; markdown: string; media: ExportedMedia[]; links: Record<string, string> }
export type ExportedWhiteboard = WhiteboardContents & {
  id: string
  type: "whiteboard"
  title: string
  svg: string
  media: ExportedMedia[]
  // The documents its boxes and arrows hold, as the reader can see them.
  links: Record<string, LinkedDocument>
}
export type ExportedDocument = ExportedText | ExportedWhiteboard | { id: string; error: string }

export const UNREADABLE = "This document could not be read."

export async function exportDocument(
  supabase: Client,
  document: { id: string; title: string; type: "text" | "whiteboard" },
  { origin, host }: { origin: string; host: string }
): Promise<ExportedDocument> {
  const doc = await loadDocument(supabase, document.id)
  if (!doc) return { id: document.id, error: UNREADABLE }

  if (document.type === "text") {
    const blocks = readTextBlocks(doc)
    const documents = await linkedDocuments(supabase, origin, linkedDocumentIds(blocks, origin))
    const exported = await exportMarkdown(blocks, { title: document.title, origin, documents })
    return { id: document.id, type: "text", title: document.title, ...exported }
  }

  const contents = readWhiteboard(doc)
  const held = [...contents.nodes, ...contents.edges].flatMap((object) => (object.docId ? [object.docId] : []))
  const links = Object.fromEntries(await linkedDocuments(supabase, origin, [...new Set(held)]))
  const media = new Map<string, ExportedMedia>()
  for (const node of contents.nodes)
    if (node.mediaPath && !media.has(node.mediaPath))
      media.set(node.mediaPath, {
        path: node.mediaPath,
        url: `${origin}${mediaHref(node.mediaPath)}`,
        name: node.title || node.alt,
      })
  return {
    id: document.id,
    type: "whiteboard",
    title: document.title,
    svg: whiteboardSvg(contents, document.title, host),
    ...contents,
    media: [...media.values()],
    links,
  }
}

// One document the reader asked for by id, if they can read it and it is
// not in the trash, inside something in the trash included.
export async function findReadableDocument(supabase: Client, documentId: string) {
  if (!isUuid(documentId)) return null
  const { data: document } = await supabase
    .from("documents")
    .select("id, title, type")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!document) return null
  const { data: ancestors } = await supabase.rpc("document_ancestors", { p_document_id: document.id })
  return ancestors?.some((ancestor) => ancestor.deleted_at !== null) ? null : document
}
