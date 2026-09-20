import type * as Y from "yjs"

import { changeDocument } from "@/lib/sync/server-document"

import type { ToolContext } from "./tool"

// Runs one edit against a document and saves what it changed. The edit
// reports its own outcome: when that is an error it has written nothing,
// so nothing is saved.
export async function editDocument<T extends object>(
  { supabase }: ToolContext,
  documentId: string,
  edit: (doc: Y.Doc) => T | { error: string },
  options?: { fresh?: boolean }
): Promise<T | { error: string }> {
  let outcome: T | { error: string } = { error: "This document could not be read." }
  const saved = await changeDocument(
    supabase,
    documentId,
    (doc) => {
      outcome = edit(doc)
    },
    options
  )
  return saved.error ? { error: saved.error } : outcome
}
