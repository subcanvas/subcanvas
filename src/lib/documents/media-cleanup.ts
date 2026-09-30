import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

// A whiteboard's pictures and videos are files in Storage, and Storage is
// not part of the database's cascades. Files go when their document goes
// for good, and a removed node's file goes once nothing can bring the node
// back (lib/whiteboard/media-release.ts).
//
// So whatever is about to delete rows for good asks first which files that
// orphans, deletes the rows, and then removes the files. In that order: if
// the delete is refused nothing is lost, and if removing fails what is left
// is an unreachable file, not a broken whiteboard.

type Client = SupabaseClient<Database>
export type MediaObject = { bucket_id: string; name: string }

// PostgREST returns at most `max_rows` rows a request (1,000 in
// supabase/config.toml, and on the hosted platform by default), whatever
// was asked for. A listing of files can be longer than that, so it is read
// a page at a time, in a fixed order, until a page comes back empty: asking
// once more costs less than knowing the server's setting, which may be
// lower than the page asked for.
export const MEDIA_PAGE_ROWS = 1000

type Page = PromiseLike<{ data: MediaObject[] | null; error: { message: string } | null }>

// Every row of a listing that `page` reads from `from` to `to` (inclusive,
// as PostgREST's ranges are). A page that fails ends it with what was read
// so far: whoever lists is about to delete rows, and a file left behind is
// unreachable, not harmful (above).
export async function everyPage(page: (from: number, to: number) => Page): Promise<MediaObject[]> {
  const rows: MediaObject[] = []
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + MEDIA_PAGE_ROWS - 1)
    if (error) {
      console.error("Listing pictures and videos to remove failed", error)
      return rows
    }
    if (!data?.length) return rows
    rows.push(...data)
  }
}

// The files of a document and everything inside it, or of a whole org.
// Empty for anyone who is not an editor of the org.
export async function listMedia(supabase: Client, orgId: string, documentId?: string): Promise<MediaObject[]> {
  return everyPage((from, to) =>
    supabase
      .rpc("media_objects", { p_org_id: orgId, p_document_id: documentId })
      .order("bucket_id")
      .order("name")
      .range(from, to)
  )
}

// The files of every document in a folder and in the folders inside it.
export async function listFolderMedia(supabase: Client, folderId: string): Promise<MediaObject[]> {
  return everyPage((from, to) =>
    supabase.rpc("folder_media_objects", { p_folder_id: folderId }).order("bucket_id").order("name").range(from, to)
  )
}

// Through the Storage API, which also deletes the bytes. Every batch is
// tried; if Storage refused any, this then throws with what it said, for
// the caller to log. The rows that pointed at these files are already gone,
// so a caller carries on.
export async function removeMedia(supabase: Client, objects: MediaObject[]) {
  const failures: string[] = []
  for (const bucket of new Set(objects.map((object) => object.bucket_id))) {
    const names = [...new Set(objects.filter((object) => object.bucket_id === bucket).map((object) => object.name))]
    for (let at = 0; at < names.length; at += 100) {
      const batch = names.slice(at, at + 100)
      const { error } = await supabase.storage.from(bucket).remove(batch)
      if (error) failures.push(`${batch.length} in ${bucket}: ${error.message}`)
    }
  }
  if (failures.length) throw new Error(`Storage did not remove some pictures and videos (${failures.join("; ")}).`)
}

// What a caller of removeMedia does with its error: says so in the server's
// log, where an operator finds files to clear by hand (docs/DEPLOYMENT.md).
export function logMediaFailure(failure: unknown) {
  console.error("Removing pictures and videos failed", failure)
}
