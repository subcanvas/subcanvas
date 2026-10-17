"use client"

import { useCallback, useSyncExternalStore } from "react"
import type * as Y from "yjs"

import { isLocked, metaMap } from "@/lib/whiteboard/lock"

// Whether the whiteboard is locked, following it as anyone locks or
// unlocks it (lib/whiteboard/lock.ts).
export function useLocked(doc: Y.Doc) {
  const subscribe = useCallback(
    (changed: () => void) => {
      const meta = metaMap(doc)
      meta.observe(changed)
      return () => meta.unobserve(changed)
    },
    [doc]
  )
  return useSyncExternalStore(
    subscribe,
    () => isLocked(doc),
    () => false
  )
}
