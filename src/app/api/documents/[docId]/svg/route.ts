import type { NextRequest } from "next/server"

import { attachment, notFound, PRIVATE } from "@/lib/export/download"
import { safeName } from "@/lib/export/layout"
import { findReadableDocument } from "@/lib/export/read"
import { readWhiteboard, whiteboardSvg } from "@/lib/export/whiteboard"
import { requestOrigin } from "@/lib/origin"
import { createClient } from "@/lib/supabase/server"
import { loadDocument } from "@/lib/sync/server-document"

// A whiteboard as an SVG file, for anyone who can read it, private projects
// included: "Download as SVG" in its menu (docs/EXPORTING.md). It is the
// picture the public embed draws (lib/whiteboard/render-svg.ts), read as the
// person in the cookie instead of as nobody, so row-level security decides.

export async function GET(request: NextRequest, context: RouteContext<"/api/documents/[docId]/svg">) {
  const { docId } = await context.params
  const supabase = await createClient()
  const document = await findReadableDocument(supabase, docId)
  if (!document || document.type !== "whiteboard") return notFound()

  const doc = await loadDocument(supabase, document.id)
  if (!doc) return new Response("This whiteboard could not be read.", { status: 500, headers: PRIVATE })

  const svg = whiteboardSvg(readWhiteboard(doc), document.title, new URL(requestOrigin(request)).host)
  return new Response(svg, {
    headers: {
      ...PRIVATE,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": attachment(`${safeName(document.title)}.svg`),
      // Should it be shown and not saved, the picture runs and loads nothing.
      // next.config.ts restates this with the frame rule added.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  })
}
