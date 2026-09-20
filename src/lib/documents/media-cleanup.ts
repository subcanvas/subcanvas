import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

// A whiteboard's pictures and videos are files in Storage, and Storage is
// not part of the database's cascades. Deleting a node never deletes its
// file: a copy of the node may show the same file, and undo has to be able
// to bring the node back. Files go when their whiteboard goes for good.
//
// So whatever is about to delete rows for good asks first which files that
// orphans, deletes the rows, and then removes the files. In that order: if
// the delete is refused nothing is lost, and if removing fails what is left
// is an unreachable file, not a broken whiteboard.

type Client = SupabaseClient<Database>
export type MediaObject = { bucket_id: string; name: string }

// The files of a document and everything inside it, or of a whole org.
// Empty for anyone who is not an editor of the org.
export async function listMedia(supabase: Client, orgId: string, documentId?: string): Promise<MediaObject[]> {
  const { data } = await supabase.rpc("media_objects", { p_org_id: orgId, p_document_id: documentId })
  return data ?? []
}

// Through the Storage API, which also deletes the bytes. Best effort: the
// rows that pointed at these files are already gone.
export async function removeMedia(supabase: Client, objects: MediaObject[]) {
  for (const bucket of new Set(objects.map((object) => object.bucket_id))) {
    const names = objects.filter((object) => object.bucket_id === bucket).map((object) => object.name)
    for (let at = 0; at < names.length; at += 100)
      await supabase.storage.from(bucket).remove(names.slice(at, at + 100))
  }
}
