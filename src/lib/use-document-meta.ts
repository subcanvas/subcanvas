"use client"

import { useEffect, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { readDocumentSource, type DocumentSource } from "@/lib/github/source"
import type { DocumentType } from "@/lib/tree"

export type DocumentMeta = {
  id: string
  title: string
  type: DocumentType
  kind: "standard" | "description"
  trashed: boolean
  // Where it was imported from, which also makes it read-only.
  source: DocumentSource | null
}

type State = { id: string; meta: DocumentMeta | null } | null

// Title and type of a linked document. `undefined` while loading, `null`
// when it no longer exists or this person may not see it.
export function useDocumentMeta(documentId: string | null): DocumentMeta | null | undefined {
  const [state, setState] = useState<State>(null)

  useEffect(() => {
    if (!documentId) return
    let cancelled = false
    createClient()
      .from("documents")
      .select("id, title, type, kind, deleted_at, source")
      .eq("id", documentId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setState({
          id: documentId,
          meta: data && {
            id: data.id,
            title: data.title,
            type: data.type,
            kind: data.kind,
            trashed: data.deleted_at !== null,
            source: readDocumentSource(data.source),
          },
        })
      })
    return () => {
      cancelled = true
    }
  }, [documentId])

  if (!documentId) return null
  return state?.id === documentId ? state.meta : undefined
}
