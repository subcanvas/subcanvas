import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import { fail, type OperationResult } from "./result"

// What a whiteboard object holds is the document whose home is that object:
// its description, or a whiteboard inside it (R1.4, R4.2). Deleting the
// object sends that document to the trash with everything nested in it, and
// bringing the object back (undo) takes it out again. A document the object
// only links to lives somewhere else and is left alone (R1.8).
//
// The canvas calls these with the browser's client and the MCP tools with
// the agent's, so row-level security decides who may, as for any edit.

type Client = SupabaseClient<Database>

export async function trashHeldDocuments(
  supabase: Client,
  whiteboardId: string,
  objectIds: string[]
): Promise<OperationResult<{ documents: { id: string; title: string; parent_object_id: string | null }[] }>> {
  if (!objectIds.length) return { ok: true, documents: [] }
  const { data, error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("parent_document_id", whiteboardId)
    .in("parent_object_id", objectIds)
    .is("deleted_at", null)
    .select("id, title, parent_object_id")
  if (error) return fail(error)
  return { ok: true, documents: data }
}

// Only the documents named: what this deletion sent to the trash, not
// whatever else the same objects once held that someone trashed on purpose.
export async function restoreHeldDocuments(supabase: Client, documentIds: string[]): Promise<OperationResult> {
  if (!documentIds.length) return { ok: true }
  const { error } = await supabase
    .from("documents")
    .update({ deleted_at: null })
    .in("id", documentIds)
    .not("deleted_at", "is", null)
  return error ? fail(error) : { ok: true }
}

// Detaching an object from the document it holds lets go of it: the
// document stays under the whiteboard as one of its own, in the tree (a
// description becomes a page, by the database's detach_description), so
// deleting the object later leaves it alone. A document the object only
// linked to lives elsewhere and is not touched: `released` is then null.
export async function releaseHeldDocument(
  supabase: Client,
  whiteboardId: string,
  objectId: string,
  documentId: string
): Promise<OperationResult<{ released: { id: string; title: string; type: "text" | "whiteboard" } | null }>> {
  const { data, error } = await supabase
    .from("documents")
    .update({ parent_object_id: null })
    .eq("id", documentId)
    .eq("parent_document_id", whiteboardId)
    .eq("parent_object_id", objectId)
    .select("id, title, type")
  if (error) return fail(error)
  return { ok: true, released: data[0] ?? null }
}

// What a person or an agent is told once a detached document went.
export function releasedWords(released: { title: string; type: "text" | "whiteboard" }) {
  return `“${released.title}” is now a ${released.type === "text" ? "page" : "whiteboard"} of its own under this whiteboard, in the project tree.`
}
