import { reconcileLinks } from "@/lib/document-links"
import { loadDocument } from "@/lib/sync/server-document"
import {
  createChildWhiteboard,
  ensureDescriptionDocument,
} from "@/lib/whiteboard/description-document"
import { edgesMap, nodesMap } from "@/lib/whiteboard/schema"

import { editDocument } from "./edit-document"
import type { ToolContext } from "./tool"
import { linkedObjects, setObjectDocument } from "./whiteboard-edits"

// Documents held by a whiteboard's nodes and arrows, made the way the
// canvas's side panel makes them (components/whiteboard/object-document):
// the document row first, with the object as its home, then the object's
// `docId` pointing at it.

type Whiteboard = { id: string; org_id: string; project_id: string }

// The table of references follows the content. A browser does this a moment
// after its own edits; an agent's edit has no browser, so it is done here.
export async function reindexLinks(context: ToolContext, whiteboard: Whiteboard) {
  const doc = await loadDocument(context.supabase, whiteboard.id)
  if (doc)
    await reconcileLinks(
      context.supabase,
      { orgId: whiteboard.org_id, documentId: whiteboard.id },
      linkedObjects(doc)
    )
}

export async function createInsideObject(
  context: ToolContext,
  whiteboard: Whiteboard,
  objectId: string,
  type: "text" | "whiteboard",
  title: string | undefined
): Promise<{ id: string } | { error: string }> {
  const doc = await loadDocument(context.supabase, whiteboard.id)
  if (!doc) return { error: "This document could not be read." }
  const object = nodesMap(doc).get(objectId) ?? edgesMap(doc).get(objectId)
  if (!object)
    return { error: `No node or edge with id ${objectId} on this whiteboard. Read the whiteboard again for current ids.` }
  if (object.get("docId"))
    return { error: "This object already holds a document. Detach it first, or edit the document it holds." }

  // The canvas names the document after the object, which for an arrow is
  // its label.
  const named = title ?? String(object.get("title") ?? object.get("label") ?? "")
  const where = { orgId: whiteboard.org_id, projectId: whiteboard.project_id, whiteboardId: whiteboard.id, slug: "", via: [] }
  const created =
    type === "text"
      ? await ensureDescriptionDocument(context.supabase, where, objectId, named)
      : await createChildWhiteboard(context.supabase, where, objectId, named)
  if ("error" in created) return created

  const linked = await editDocument(context, whiteboard.id, (board) =>
    setObjectDocument(board, objectId, { docId: created.id, docType: type })
  )
  return "error" in linked ? linked : created
}
