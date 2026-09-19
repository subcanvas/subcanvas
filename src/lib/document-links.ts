import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

export type LinkedObject = { objectId: string; docId: string }

// Brings the document_links rows of one source document in line with what
// its content says. Content is the truth (it is what people edit, undo, and
// merge); the table is an index of it. Documents whose home is the source
// are its children, not references, and are skipped.
export async function reconcileLinks(
  supabase: SupabaseClient<Database>,
  source: { orgId: string; documentId: string },
  linked: LinkedObject[]
) {
  const [{ data: children }, { data: existing }] = await Promise.all([
    supabase.from("documents").select("id").eq("parent_document_id", source.documentId),
    supabase
      .from("document_links")
      .select("id, source_object_id, target_document_id")
      .eq("source_document_id", source.documentId),
  ])
  if (!children || !existing) return

  const childIds = new Set(children.map((child) => child.id))
  const key = (objectId: string, docId: string) => `${objectId} ${docId}`

  const wanted = new Map(
    linked
      .filter((link) => !childIds.has(link.docId) && link.docId !== source.documentId)
      .map((link) => [key(link.objectId, link.docId), link])
  )
  const have = new Set(existing.map((row) => key(row.source_object_id, row.target_document_id)))

  const stale = existing
    .filter((row) => !wanted.has(key(row.source_object_id, row.target_document_id)))
    .map((row) => row.id)
  const missing = [...wanted.entries()].filter(([k]) => !have.has(k)).map(([, link]) => link)

  if (stale.length) await supabase.from("document_links").delete().in("id", stale)
  if (missing.length)
    // A target that was deleted forever fails the insert; nothing to index.
    await supabase.from("document_links").insert(
      missing.map((link) => ({
        org_id: source.orgId,
        source_document_id: source.documentId,
        source_object_id: link.objectId,
        target_document_id: link.docId,
      }))
    )
}
