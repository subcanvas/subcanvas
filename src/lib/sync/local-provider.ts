import { IndexeddbPersistence } from "y-indexeddb"
import { Awareness, removeAwarenessStates } from "y-protocols/awareness"
import * as Y from "yjs"

import type { DocProvider } from "./doc-provider"
import type { Peer } from "./supabase-provider"

const NO_PEERS: Peer[] = []

// A document kept in this browser's IndexedDB and nowhere else: the
// playground's (app/try). Nobody else is ever in it, so it is connected and
// saved from the start, and it has loaded once IndexedDB has handed it over.
export class LocalProvider implements DocProvider {
  readonly doc = new Y.Doc()
  readonly awareness = new Awareness(this.doc)
  readonly status = "connected" as const
  readonly saveStatus = "saved" as const
  readonly peers = NO_PEERS
  readonly viewers = 0
  loaded = false

  private readonly persistence: IndexeddbPersistence
  private readonly listeners = new Set<() => void>()

  constructor(name: string) {
    this.persistence = new IndexeddbPersistence(name, this.doc)
    void this.persistence.whenSynced.then(() => {
      this.loaded = true
      for (const listener of this.listeners) listener()
    })
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setUser() {}

  destroy() {
    removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy")
    void this.persistence.destroy()
    this.doc.destroy()
  }
}
