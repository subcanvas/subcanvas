import { z } from "zod"

import { logMediaFailure, removeMedia } from "@/lib/documents/media-cleanup"
import { createClient } from "@/lib/supabase/server"
import { loadDocument } from "@/lib/sync/server-document"
import { mediaObjectsOf, unshownMedia } from "@/lib/whiteboard/media-release"

// Lets go of the files of pictures and videos removed from a whiteboard,
// once the person who removed them can no longer bring them back
// (components/whiteboard/media-release.ts asks, as they leave it). Only a
// file that no node of the whiteboard shows is removed, read from the
// whiteboard as last saved; the removal may still be on its way there, so a
// file that is still shown is looked at once more, a moment later.
//
// Row-level security is the check: the whiteboard is read, and the files
// removed, as the person in the cookie, who must be an editor of its org.
// Called with `keepalive`, so that it is still sent when the tab closes.

const body = z.object({
  whiteboardId: z.string().uuid(),
  paths: z.array(z.string().max(300)).min(1).max(100),
})

const SAVE_DELAY_MS = 2000

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new Response(null, { status: 400 })
  const { whiteboardId, paths } = parsed.data

  const supabase = await createClient()
  const { data: whiteboard } = await supabase
    .from("documents")
    .select("type")
    .eq("id", whiteboardId)
    .maybeSingle()
  if (whiteboard?.type !== "whiteboard") return new Response(null, { status: 404 })

  const unshown = async () => {
    const doc = await loadDocument(supabase, whiteboardId)
    return doc ? unshownMedia(doc, whiteboardId, paths) : []
  }
  let free = await unshown()
  if (free.length < paths.length) {
    await new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS))
    free = await unshown()
  }
  await removeMedia(supabase, mediaObjectsOf(free)).catch(logMediaFailure)
  return new Response(null, { status: 204 })
}
