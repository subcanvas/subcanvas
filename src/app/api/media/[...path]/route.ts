import type { NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { MEDIA_BUCKETS, mediaTypeOf, parseMediaPath } from "@/lib/whiteboard/media"

// An address for a whiteboard's picture or video that stays the same: what
// "Open the file" in the panel links to, and what an agent is given to show
// its user. The buckets are private and their signed addresses run out, so
// this checks who is asking and sends them on to a fresh one.
//
// The check is row-level security: the signed address is asked for as the
// person in the cookie, or as nobody, and Storage refuses what they could
// not read. The file itself never passes through here. Storage serves it,
// byte ranges included, so a host that caps the size of a response is no
// limit on a video. The canvas does not come through here either: it asks
// Storage directly, for every file on a whiteboard in one request.

const SIGNED_FOR_SECONDS = 60 * 60

export async function GET(_request: NextRequest, context: RouteContext<"/api/media/[...path]">) {
  const path = parseMediaPath((await context.params).path.join("/"))
  const supabase = await createClient()
  const { data } = path
    ? await supabase.storage.from(MEDIA_BUCKETS[mediaTypeOf(path)]).createSignedUrl(path, SIGNED_FOR_SECONDS)
    : { data: null }

  // The same answer for a file that is not there and one that is not theirs.
  if (!data) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })
  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      // The answer depends on who asked, and is only good for an hour.
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}
