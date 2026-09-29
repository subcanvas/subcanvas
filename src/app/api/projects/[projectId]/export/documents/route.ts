import type { NextRequest } from "next/server"

import { PRIVATE } from "@/lib/export/download"
import { exportDocument, isUuid, UNREADABLE, type ExportedDocument } from "@/lib/export/read"
import { requestOrigin } from "@/lib/origin"
import { createClient } from "@/lib/supabase/server"

// Some documents of a project, converted for its export: each text document
// as Markdown, each whiteboard as its picture and its contents. The browser
// asks for a few at a time (lib/export/zip.ts), and the answer is one line
// of JSON per document, sent as each is done.
//
// A host may cap a response's size (Vercel: 4.5 MB), so an
// answer carries at most BUDGET_BYTES, or one document when that alone is
// more, and the browser asks again for the rest.

// BlockNote's headless editor needs Node.
export const runtime = "nodejs"
// A batch is a few dozen documents; a minute is far more than one takes.
export const maxDuration = 60

const MAX_BATCH = 50
const BUDGET_BYTES = 4_000_000

export async function GET(request: NextRequest, context: RouteContext<"/api/projects/[projectId]/export/documents">) {
  const { projectId } = await context.params
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(isUuid))]
  if (!isUuid(projectId) || !ids.length || ids.length > MAX_BATCH)
    return Response.json({ error: `Ask for 1 to ${MAX_BATCH} documents by id.` }, { status: 400, headers: PRIVATE })

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from("documents")
    .select("id, title, type")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .in("id", ids)
  const byId = new Map(rows?.map((row) => [row.id, row]))
  const origin = requestOrigin(request)
  const host = new URL(origin).host

  async function* lines(): AsyncGenerator<ExportedDocument> {
    // One at a time: the converter borrows the process's DOM while it runs.
    for (const id of ids) {
      const row = byId.get(id)
      if (!row) yield { id, error: UNREADABLE }
      else yield await exportDocument(supabase, row, { origin, host }).catch(() => ({ id, error: UNREADABLE }))
    }
  }

  const encoder = new TextEncoder()
  const iterator = lines()
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next()
      const line = done ? null : encoder.encode(`${JSON.stringify(value)}\n`)
      // A document that does not fit is left for the next request.
      if (!line || (sent && sent + line.length > BUDGET_BYTES)) {
        await iterator.return(undefined)
        return controller.close()
      }
      sent += line.length
      controller.enqueue(line)
    },
    async cancel() {
      await iterator.return(undefined)
    },
  })
  return new Response(body, { headers: { ...PRIVATE, "Content-Type": "application/x-ndjson; charset=utf-8" } })
}
