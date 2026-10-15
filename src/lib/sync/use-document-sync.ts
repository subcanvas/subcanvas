"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"

import { useDocumentStore, type DocumentStore } from "@/lib/documents/store"

import type { DocProvider } from "./doc-provider"
import type { Peer } from "./supabase-provider"

const EMPTY_PEERS: Peer[] = []

// One provider, and so one Y.Doc, per document id no matter how many
// components show that document. This keeps the side panel and the full page
// in step (R5.4). Release is delayed so a remount does not reconnect. The
// document store says where a document is kept (lib/documents/store.tsx).

const RELEASE_DELAY_MS = 1000

type Entry = {
  provider: DocProvider
  refs: number
  releaseTimer: ReturnType<typeof setTimeout> | null
}

const entries = new Map<string, Entry>()
const registryListeners = new Set<() => void>()

function subscribeRegistry(listener: () => void) {
  registryListeners.add(listener)
  return () => {
    registryListeners.delete(listener)
  }
}

function notifyRegistry() {
  for (const listener of registryListeners) listener()
}

function acquire(store: DocumentStore, documentId: string, readOnly: boolean) {
  let entry = entries.get(documentId)
  if (!entry) {
    entry = {
      provider: store.openDocument(documentId, readOnly),
      refs: 0,
      releaseTimer: null,
    }
    entries.set(documentId, entry)
    notifyRegistry()
  }
  if (entry.releaseTimer) clearTimeout(entry.releaseTimer)
  entry.releaseTimer = null
  entry.refs++
}

function release(documentId: string) {
  const entry = entries.get(documentId)
  if (!entry || --entry.refs > 0) return
  entry.releaseTimer = setTimeout(() => {
    entry.provider.destroy()
    entries.delete(documentId)
    notifyRegistry()
  }, RELEASE_DELAY_MS)
}

export function useDocumentSync(documentId: string, readOnly: boolean) {
  const store = useDocumentStore()
  useEffect(() => {
    acquire(store, documentId, readOnly)
    return () => release(documentId)
  }, [store, documentId, readOnly])

  const getProvider = useCallback(
    () => entries.get(documentId)?.provider ?? null,
    [documentId]
  )
  return useSyncExternalStore(subscribeRegistry, getProvider, () => null)
}

export function useSyncStatus(provider: DocProvider) {
  const status = useSyncExternalStore(
    provider.subscribe,
    () => provider.status,
    () => "connecting" as const
  )
  const saveStatus = useSyncExternalStore(
    provider.subscribe,
    () => provider.saveStatus,
    () => "saved" as const
  )
  const loaded = useSyncExternalStore(
    provider.subscribe,
    () => provider.loaded,
    () => false
  )
  const peers = useSyncExternalStore(
    provider.subscribe,
    () => provider.peers,
    () => EMPTY_PEERS
  )
  const viewers = useSyncExternalStore(
    provider.subscribe,
    () => provider.viewers,
    () => 0
  )
  return { status, saveStatus, loaded, peers, viewers }
}
