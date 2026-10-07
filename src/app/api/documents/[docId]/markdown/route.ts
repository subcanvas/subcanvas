import type { NextRequest } from "next/server"

import { attachment, notFound, PRIVATE } from "@/lib/export/download"
import { safeName } from "@/lib/export/layout"
import { exportDocument, findReadableDocument } from "@/lib/export/read"
import { requestOrigin } from "@/lib/origin"
import { createClient } from "@/lib/supabase/server"

// A text document as a Markdown file, for anyone who can read it: "Download
// as Markdown" in its menu (docs/EXPORTING.md). Read as the person in the
// cookie, or as nobody on a public project, so row-level security decides.
// Links to other documents and pictures are the app's addresses, written in
// full, so they open from wherever the file is kept.

// BlockNote's headless editor needs Node.
export const runtime = "nodejs"

export async function GET(request: NextRequest, context: RouteContext<"/api/documents/[docId]/markdown">) {
  const { docId } = await context.params
  const supabase = await createClient()
  const document = await findReadableDocument(supabase, docId)
  // The same answer for a document that is not there and one that is not theirs.
  if (!document || document.type !== "text") return notFound()

  const origin = requestOrigin(request)
  const exported = await exportDocument(supabase, document, { origin, host: new URL(origin).host })
  if (!("markdown" in exported))
    return new Response("This document could not be read.", { status: 500, headers: PRIVATE })
  return new Response(exported.markdown, {
    headers: {
      ...PRIVATE,
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": attachment(`${safeName(document.title)}.md`),
    },
  })
}
