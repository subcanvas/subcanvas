import type { SupabaseClient } from "@supabase/supabase-js"

import { limitMessage } from "@/lib/billing/limit"
import type { Database } from "@/lib/supabase/database.types"

// Where a whiteboard lives, which is what a new document inside it needs.
export type WhiteboardContext = {
  orgId: string
  projectId: string
  whiteboardId: string
  slug: string
  // The documents the reader passed through to get here, outermost first.
  via: string[]
}

function uuidBytes(uuid: string) {
  const hex = uuid.replace(/-/g, "")
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16))
}

// A name-based UUID (RFC 4122 version 5) under a namespace UUID.
export async function uuidV5(namespace: string, name: string) {
  const data = new Uint8Array([...uuidBytes(namespace), ...new TextEncoder().encode(name)])
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data)).slice(0, 16)
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Creates the description document of a whiteboard object (R4.2) and
// returns its id. The id is derived from the whiteboard and the object, so
// two people who start a description at the same moment create the same
// document instead of two competing ones.
export async function ensureDescriptionDocument(
  supabase: SupabaseClient<Database>,
  context: WhiteboardContext,
  objectId: string,
  title: string
): Promise<{ id: string } | { error: string }> {
  const id = await uuidV5(context.whiteboardId, objectId)

  const { error } = await supabase.from("documents").insert({
    id,
    org_id: context.orgId,
    project_id: context.projectId,
    type: "text",
    kind: "description",
    title: title.trim().slice(0, 200) || "Description",
    parent_document_id: context.whiteboardId,
    parent_object_id: objectId,
  })

  // 23505: it already exists, which is the outcome we wanted.
  if (error && error.code !== "23505")
    return {
      error:
        error.code === "42501"
          ? "You do not have permission to add a description."
          : error.message,
    }
  return { id }
}

// Creates a whiteboard whose home is a whiteboard object (R1.6). Unlike a
// description it is a standard document: it shows in the tree, nested
// under this whiteboard, and counts toward the free-tier limit.
export async function createChildWhiteboard(
  supabase: SupabaseClient<Database>,
  context: WhiteboardContext,
  objectId: string,
  title: string
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      org_id: context.orgId,
      project_id: context.projectId,
      type: "whiteboard",
      title: title.trim().slice(0, 200) || "Untitled",
      parent_document_id: context.whiteboardId,
      parent_object_id: objectId,
      position: Date.now(),
    })
    .select("id")
    .single()

  if (error)
    return {
      error:
        limitMessage(error.code) ??
          (error.code === "42501"
            ? "You do not have permission to create documents."
            : error.message),
    }
  return { id: data.id }
}
