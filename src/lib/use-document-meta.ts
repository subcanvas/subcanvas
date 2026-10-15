"use client"

import { useEffect, useState } from "react"

import { useDocumentStore } from "@/lib/documents/store"
import type { DocumentSource } from "@/lib/github/source"
import type { ItemIcon } from "@/lib/item-icon"
import type { DocumentType } from "@/lib/tree"

export type DocumentMeta = {
  id: string
  title: string
  type: DocumentType
  kind: "standard" | "description"
  trashed: boolean
  // Where it was imported from, which also makes it read-only.
  source: DocumentSource | null
  icon: ItemIcon | null
}

type State = { id: string; meta: DocumentMeta | null } | null

// Title and type of a linked document. `undefined` while loading, `null`
// when it no longer exists or this person may not see it. Read again when
// the document store says something changed (the playground's does).
export function useDocumentMeta(documentId: string | null): DocumentMeta | null | undefined {
  const store = useDocumentStore()
  const [state, setState] = useState<State>(null)

  useEffect(() => {
    if (!documentId) return
    let cancelled = false
    const read = () =>
      void store.readMeta(documentId).then((meta) => {
        if (!cancelled) setState({ id: documentId, meta })
      })
    read()
    const unsubscribe = store.subscribe?.(read)
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [store, documentId])

  if (!documentId) return null
  return state?.id === documentId ? state.meta : undefined
}
