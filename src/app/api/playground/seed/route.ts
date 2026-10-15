import * as Y from "yjs"

import { drawRepository } from "@/lib/github/import-repository"
import { createMemoryProvider } from "@/lib/github/memory-provider"
import { EXAMPLE_FILES, EXAMPLE_REPOSITORY } from "@/lib/playground/example-repository"
import type { PlaygroundSeed } from "@/lib/playground/seed"
import { toBase64 } from "@/lib/sync/encoding"

// The playground's starting project: the example repository, drawn by the
// import as any repository is. Made once when the app is built, and the same
// for every visitor; each keeps their own copy in their browser from then on.
export const dynamic = "force-static"

export async function GET() {
  const drawn = await drawRepository(createMemoryProvider(EXAMPLE_REPOSITORY, EXAMPLE_FILES), EXAMPLE_REPOSITORY, {
    orgId: "playground",
    projectId: "playground",
    userId: "playground",
  })
  const seed: PlaygroundSeed = {
    topDocumentId: drawn.topDocumentId,
    documents: drawn.rows.map((row) => ({
      id: row.id!,
      type: row.type,
      kind: row.kind ?? "standard",
      title: row.title ?? "Untitled",
      parentId: row.parent_document_id ?? null,
      parentObjectId: row.parent_object_id ?? null,
    })),
    contents: Object.fromEntries(
      drawn.contents.map(({ documentId, change }) => {
        const doc = new Y.Doc()
        change(doc)
        return [documentId, toBase64(Y.encodeStateAsUpdate(doc))]
      })
    ),
  }
  return Response.json(seed)
}
