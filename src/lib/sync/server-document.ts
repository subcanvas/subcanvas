import type { SupabaseClient } from "@supabase/supabase-js"
import * as Y from "yjs"

import type { Database } from "@/lib/supabase/database.types"

import { fromBytea, toBytea } from "./encoding"

// A document's Yjs state, read and written from the server: no browser and no
// Realtime socket. The embed renderer reads with it; a repository import and
// (later) the MCP server write with it. See docs/ROADMAP.md, "Shared
// foundation".
//
// It goes through the caller's Supabase client, so row-level security decides
// what can be read and written exactly as it does for a browser. Nothing here
// uses a secret key.

type Client = SupabaseClient<Database>

// The document as of its last persisted update. Browsers persist about a
// second after an edit, so this is at most that far behind what people see.
// Returns null when the document cannot be read (missing, or not allowed).
export async function loadDocument(supabase: Client, documentId: string): Promise<Y.Doc | null> {
  // Updates first, snapshot second, as the browser does: if a compaction
  // lands in between, the snapshot read afterwards already contains the rows
  // it deleted. Applying an update twice is harmless.
  const { data: rows, error: rowsError } = await supabase
    .from("document_updates")
    .select("id, update")
    .eq("document_id", documentId)
    .order("id")
  const { data: snapshot, error: snapshotError } = await supabase
    .from("document_snapshots")
    .select("state")
    .eq("document_id", documentId)
    .maybeSingle()
  if (rowsError || snapshotError) return null

  const updates: Uint8Array[] = []
  if (snapshot) updates.push(fromBytea(snapshot.state))
  for (const row of rows) updates.push(fromBytea(row.update))

  const doc = new Y.Doc()
  if (updates.length) Y.applyUpdate(doc, Y.mergeUpdates(updates))
  return doc
}

// Runs `change` against the document and persists what it changed as one
// update, which merges with whatever anyone else is doing. People who have
// the document open pick it up on their next database re-read (within 30 s);
// announcing it over Realtime's HTTP broadcast is a later step.
//
// For a document that was just created and is still empty, pass `fresh` to
// skip the read.
export async function changeDocument(
  supabase: Client,
  documentId: string,
  change: (doc: Y.Doc) => void,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<{ error: string | null }> {
  const doc = fresh ? new Y.Doc() : await loadDocument(supabase, documentId)
  if (!doc) return { error: "This document could not be read." }

  const update = encodeChange(doc, change)
  if (!update) return { error: null }

  const { error } = await supabase
    .from("document_updates")
    .insert({ document_id: documentId, update: toBytea(update) })
  return { error: error ? "This document could not be saved." : null }
}

// Well under what the API accepts in one request body, hex-encoded.
const MAX_BATCH_BYTES = 1_000_000

// The same for many documents that were all just created, in as few
// requests as their size allows. An import writes dozens at once, and one
// request each would be most of the time it takes.
export async function writeNewDocuments(
  supabase: Client,
  documents: { documentId: string; change: (doc: Y.Doc) => void }[]
): Promise<{ error: string | null }> {
  let batch: { document_id: string; update: string }[] = []
  let batchBytes = 0
  const flush = async () => {
    if (!batch.length) return null
    const { error } = await supabase.from("document_updates").insert(batch)
    batch = []
    batchBytes = 0
    return error
  }

  for (const { documentId, change } of documents) {
    const update = encodeChange(new Y.Doc(), change)
    if (!update) continue
    if (batchBytes + update.length > MAX_BATCH_BYTES && (await flush()))
      return { error: "These documents could not be saved." }
    batch.push({ document_id: documentId, update: toBytea(update) })
    batchBytes += update.length
  }
  return { error: (await flush()) ? "These documents could not be saved." : null }
}

function encodeChange(doc: Y.Doc, change: (doc: Y.Doc) => void) {
  const before = Y.encodeStateVector(doc)
  doc.transact(() => change(doc))
  const update = Y.encodeStateAsUpdate(doc, before)
  // An update that changes nothing is two bytes: no structs, no deletes.
  return update.length <= 2 ? null : update
}
