import { clearDocument, IndexeddbPersistence } from "y-indexeddb"
import * as Y from "yjs"

import type { DocumentStore } from "@/lib/documents/store"
import type { ItemIcon } from "@/lib/item-icon"
import { fromBase64 } from "@/lib/sync/encoding"
import { LocalProvider } from "@/lib/sync/local-provider"
import { uuidV5 } from "@/lib/whiteboard/description-document"

import type { PlaygroundSeed, SeedDocument } from "./seed"

// The playground's documents, kept in this browser and nowhere else
// (app/try). The index is a Y.Doc of its own in IndexedDB, holding where
// every document is and what it is called; each document's content is
// another, opened by LocalProvider. A first visit copies the example in
// (app/api/playground/seed); "Start over" deletes all of it.

const PREFIX = "subcanvas-playground"
const INDEX = `${PREFIX}:index`
// What "Start over" leaves to be deleted on the next load, before anything
// has the databases open: a database still open cannot be deleted.
const START_OVER = `${PREFIX}:start-over`
const contentName = (documentId: string) => `${PREFIX}:${documentId}`

type Entry = SeedDocument & { deleted: boolean; icon: ItemIcon | null }

// The address of a document is made of a few characters of its id
// (lib/navigation.ts), as the database makes it.
export const codeOf = (documentId: string) => documentId.replace(/-/g, "").slice(0, 8)

export type PlaygroundIndex = {
  store: DocumentStore
  topDocumentId: string
  // Changes whenever a document is made, renamed, given an icon or trashed.
  version(): number
  documents(): Entry[]
  find(documentId: string): Entry | null
  // Everything the playground holds is deleted on the next load, and the
  // example comes back. The caller reloads the page.
  startOver(): void
}

// Opens the index, copying the example in on a first visit.
export async function openPlayground(loadSeed: () => Promise<PlaygroundSeed>): Promise<PlaygroundIndex> {
  const leftOver = localStorage.getItem(START_OVER)
  if (leftOver) {
    await Promise.all((JSON.parse(leftOver) as string[]).map((name) => clearDocument(name)))
    localStorage.removeItem(START_OVER)
  }

  const index = new Y.Doc()
  await new IndexeddbPersistence(INDEX, index).whenSynced
  const entries = index.getMap<Entry>("documents")
  const info = index.getMap<string>("info")

  if (!info.get("topDocumentId")) {
    const seed = await loadSeed()
    // The documents first and the index last, so a visit cut short copies
    // the example again next time instead of pointing at empty documents.
    await Promise.all(
      Object.entries(seed.contents).map(async ([documentId, content]) => {
        const doc = new Y.Doc()
        Y.applyUpdate(doc, fromBase64(content))
        const persistence = new IndexeddbPersistence(contentName(documentId), doc)
        await persistence.whenSynced
        await persistence.destroy()
      })
    )
    index.transact(() => {
      for (const document of seed.documents) entries.set(document.id, { ...document, deleted: false, icon: null })
      info.set("topDocumentId", seed.topDocumentId)
    })
  }

  const listeners = new Set<() => void>()
  let version = 0
  entries.observe(() => {
    version++
    for (const listener of listeners) listener()
  })

  const find = (documentId: string) => entries.get(documentId) ?? null
  const put = (entry: Entry) => entries.set(entry.id, entry)
  const change = (documentId: string, patch: Partial<Entry>) => {
    const entry = find(documentId)
    if (entry) put({ ...entry, ...patch })
  }
  // In the trash, or inside something that is.
  const trashed = (entry: Entry): boolean => {
    for (let at: Entry | null = entry; at; at = at.parentId ? find(at.parentId) : null) if (at.deleted) return true
    return false
  }
  const create = (fields: Omit<Entry, "deleted" | "icon">) => {
    put({ ...fields, deleted: false, icon: null })
    return { id: fields.id }
  }

  const store: DocumentStore = {
    openDocument: (documentId) => new LocalProvider(contentName(documentId)),

    async readMeta(documentId) {
      const entry = find(documentId)
      return (
        entry && {
          id: entry.id,
          title: entry.title,
          type: entry.type,
          kind: entry.kind,
          trashed: trashed(entry),
          // What came from the example is the visitor's to change.
          source: null,
          icon: entry.icon,
        }
      )
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async createDescription(context, objectId, title) {
      // The id the app would give it (lib/whiteboard/description-document.ts).
      let id = await uuidV5(context.whiteboardId, objectId)
      const existing = find(id)
      if (existing && existing.parentId === context.whiteboardId && existing.parentObjectId === objectId) return { id }
      if (existing) id = crypto.randomUUID()
      return create({
        id,
        type: "text",
        kind: "description",
        title: title.trim().slice(0, 200) || "Description",
        parentId: context.whiteboardId,
        parentObjectId: objectId,
      })
    },

    async createChildWhiteboard(context, objectId, title) {
      return create({
        id: crypto.randomUUID(),
        type: "whiteboard",
        kind: "standard",
        title: title.trim().slice(0, 200) || "Untitled",
        parentId: context.whiteboardId,
        parentObjectId: objectId,
      })
    },

    async createInside(home, type) {
      return create({
        id: crypto.randomUUID(),
        type,
        kind: "standard",
        title: "Untitled",
        parentId: home.documentId,
        parentObjectId: null,
      })
    },

    async trashHeld(whiteboardId, objectIds) {
      const held = [...entries.values()].filter(
        (entry) =>
          entry.parentId === whiteboardId &&
          entry.parentObjectId !== null &&
          objectIds.includes(entry.parentObjectId) &&
          !entry.deleted
      )
      index.transact(() => held.forEach((entry) => change(entry.id, { deleted: true })))
      return {
        ok: true,
        documents: held.map(({ id, title, parentObjectId }) => ({ id, title, parent_object_id: parentObjectId })),
      }
    },

    async restoreHeld(documentIds) {
      index.transact(() => documentIds.forEach((id) => change(id, { deleted: false })))
      return { ok: true }
    },

    async releaseHeld(whiteboardId, objectId, documentId) {
      const entry = find(documentId)
      if (!entry || entry.parentId !== whiteboardId || entry.parentObjectId !== objectId) return { ok: true, released: null }
      change(documentId, { parentObjectId: null, kind: "standard" })
      return { ok: true, released: { id: entry.id, title: entry.title, type: entry.type } }
    },

    // Nothing reads an index of links here.
    async reconcileLinks() {},

    async rename(_, documentId, title) {
      change(documentId, { title: title.trim().slice(0, 200) || "Untitled" })
      return { ok: true }
    },

    async setIcon(_, documentId, icon) {
      change(documentId, { icon })
      return { ok: true }
    },

    can: { media: false, linkCards: false, linkExisting: false, detach: false, mermaidDocuments: false },
  }

  return {
    store,
    topDocumentId: info.get("topDocumentId")!,
    version: () => version,
    documents: () => [...entries.values()],
    find,
    startOver() {
      localStorage.setItem(START_OVER, JSON.stringify([INDEX, ...[...entries.keys()].map(contentName)]))
    },
  }
}
