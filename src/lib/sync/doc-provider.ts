import type { Awareness } from "y-protocols/awareness"
import type * as Y from "yjs"

import type { Peer, SaveStatus, SyncStatus } from "./supabase-provider"

// What the editors need from whatever keeps a document: its Y.Doc, who else
// is in it, and whether it has loaded and saved. SupabaseProvider shares a
// document with everyone in it; LocalProvider keeps one in this browser,
// for the playground (app/try).
export interface DocProvider {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  readonly status: SyncStatus
  readonly saveStatus: SaveStatus
  readonly loaded: boolean
  readonly peers: Peer[]
  readonly viewers: number
  subscribe(listener: () => void): () => void
  setUser(user: Peer): void
  destroy(): void
}
