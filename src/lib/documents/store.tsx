"use client"

import { createContext, use } from "react"

import { renameItem, setDocumentIcon, type ProjectRef } from "@/app/[org]/[project]/tree-actions"
import { limitMessage } from "@/lib/billing/limit"
import { reconcileLinks, type LinkedObject } from "@/lib/document-links"
import { readDocumentSource } from "@/lib/github/source"
import type { ItemIcon } from "@/lib/item-icon"
import { readItemIcon } from "@/lib/item-icon"
import { createClient } from "@/lib/supabase/client"
import type { DocProvider } from "@/lib/sync/doc-provider"
import { SupabaseProvider } from "@/lib/sync/supabase-provider"
import type { DocumentType } from "@/lib/tree"
import type { DocumentMeta } from "@/lib/use-document-meta"
import {
  createChildWhiteboard,
  ensureDescriptionDocument,
  type WhiteboardContext,
} from "@/lib/whiteboard/description-document"

import { releaseHeldDocument, restoreHeldDocuments, trashHeldDocuments } from "./held"
import type { OperationResult } from "./result"

// Where the editors keep documents, apart from what is written in them:
// making the page or whiteboard an object holds, a page inside a page, its
// title and icon, the trash that follows a deleted object, and the index of
// links. In the app that is the project's database (supabaseStore); in the
// playground (app/try) it is this browser (lib/playground/local-store.ts).
// The editors ask for it with useDocumentStore, so they work the same on
// either.

export type Created = { id: string } | { error: string; limit?: true }
type Released = OperationResult<{ released: { id: string; title: string; type: DocumentType } | null }>
type Trashed = OperationResult<{ documents: { id: string; title: string; parent_object_id: string | null }[] }>

export type DocumentStore = {
  // The shared Y.Doc of a document (lib/sync/use-document-sync.ts).
  openDocument(documentId: string, readOnly: boolean): DocProvider
  // Null when the document is gone, or not this person's to see.
  readMeta(documentId: string): Promise<DocumentMeta | null>
  // Told when what readMeta says may have changed. The database tells
  // nobody; a page is refreshed instead.
  subscribe?: (listener: () => void) => () => void
  createDescription(context: WhiteboardContext, objectId: string, title: string): Promise<Created>
  createChildWhiteboard(context: WhiteboardContext, objectId: string, title: string): Promise<Created>
  // A page or whiteboard whose home is a page (R1.6).
  createInside(home: { orgId: string; projectId: string; documentId: string }, type: DocumentType): Promise<Created>
  trashHeld(whiteboardId: string, objectIds: string[]): Promise<Trashed>
  restoreHeld(documentIds: string[]): Promise<OperationResult>
  releaseHeld(whiteboardId: string, objectId: string, documentId: string): Promise<Released>
  reconcileLinks(source: { orgId: string; documentId: string }, linked: LinkedObject[]): Promise<void>
  rename(project: ProjectRef, documentId: string, title: string): Promise<OperationResult>
  setIcon(project: ProjectRef, documentId: string, icon: ItemIcon | null): Promise<OperationResult>
  // What needs more than a place to keep documents: files (pictures and
  // videos), a server to read a pasted link's page, the project's other
  // documents to link to, the server's Mermaid import (an ER diagram's
  // pages, a code block drawn as a whiteboard), and Detach, which leaves a
  // document of its own in the project tree.
  can: { media: boolean; linkCards: boolean; linkExisting: boolean; detach: boolean; mermaidDocuments: boolean }
}

export const supabaseStore: DocumentStore = {
  openDocument: (documentId, readOnly) => new SupabaseProvider(createClient(), documentId, readOnly),

  async readMeta(documentId) {
    const supabase = createClient()
    const [{ data }, { data: live }] = await Promise.all([
      supabase.from("documents").select("id, title, type, kind, deleted_at, source, icon").eq("id", documentId).maybeSingle(),
      supabase.rpc("document_is_live", { p_document_id: documentId }),
    ])
    return (
      data && {
        id: data.id,
        title: data.title,
        type: data.type,
        kind: data.kind,
        // Inside something in the trash is in the trash too.
        trashed: data.deleted_at !== null || live === false,
        source: readDocumentSource(data.source),
        icon: readItemIcon(data.icon),
      }
    )
  },

  createDescription: (context, objectId, title) => ensureDescriptionDocument(createClient(), context, objectId, title),
  createChildWhiteboard: (context, objectId, title) => createChildWhiteboard(createClient(), context, objectId, title),

  async createInside(home, type) {
    const { data, error } = await createClient()
      .from("documents")
      .insert({
        org_id: home.orgId,
        project_id: home.projectId,
        type,
        parent_document_id: home.documentId,
        position: Date.now(),
      })
      .select("id")
      .single()
    if (!error) return { id: data.id }
    const limit = limitMessage(error.code, error.message)
    if (limit) return { error: limit, limit: true }
    return { error: error.code === "42501" ? "You do not have permission to create documents." : error.message }
  },

  trashHeld: (whiteboardId, objectIds) => trashHeldDocuments(createClient(), whiteboardId, objectIds),
  restoreHeld: (documentIds) => restoreHeldDocuments(createClient(), documentIds),
  releaseHeld: (whiteboardId, objectId, documentId) =>
    releaseHeldDocument(createClient(), whiteboardId, objectId, documentId),
  reconcileLinks: (source, linked) => reconcileLinks(createClient(), source, linked),
  rename: (project, documentId, title) => renameItem(project, "document", documentId, title),
  setIcon: (project, documentId, icon) => setDocumentIcon(project, documentId, icon),

  can: { media: true, linkCards: true, linkExisting: true, detach: true, mermaidDocuments: true },
}

const StoreContext = createContext<DocumentStore>(supabaseStore)

export const DocumentStoreProvider = StoreContext

export function useDocumentStore() {
  return use(StoreContext)
}
