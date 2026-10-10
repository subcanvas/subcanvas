import type { NextRequest } from "next/server"

import { attachment, notFound, PRIVATE } from "@/lib/export/download"
import { safeName } from "@/lib/export/layout"
import { findReadableDocument } from "@/lib/export/read"
import { readWhiteboard } from "@/lib/export/whiteboard"
import { whiteboardMermaid } from "@/lib/mermaid/export"
import { createClient } from "@/lib/supabase/server"
import { loadDocument } from "@/lib/sync/server-document"

// A whiteboard as Mermaid text, for anyone who can read it: "Copy as
// Mermaid" and "Download as Mermaid" in its menu (docs/EXPORTING.md). With
// `?download` it comes as a .mmd file; without, as text to copy.

export async function GET(request: NextRequest, context: RouteContext<"/api/documents/[docId]/mermaid">) {
  const { docId } = await context.params
  const supabase = await createClient()
  const document = await findReadableDocument(supabase, docId)
  if (!document || document.type !== "whiteboard") return notFound()

  const doc = await loadDocument(supabase, document.id)
  if (!doc) return new Response("This whiteboard could not be read.", { status: 500, headers: PRIVATE })

  const text = whiteboardMermaid(readWhiteboard(doc), document.title)
  return new Response(text, {
    headers: {
      ...PRIVATE,
      "Content-Type": "text/plain; charset=utf-8",
      ...(request.nextUrl.searchParams.has("download")
        ? { "Content-Disposition": attachment(`${safeName(document.title)}.mmd`) }
        : {}),
    },
  })
}
