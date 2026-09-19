"use client"

import dynamic from "next/dynamic"

import { SyncBadge } from "@/components/editor/sync-badge"
import { useDocumentSync, useSyncStatus } from "@/lib/sync/use-document-sync"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"

const Whiteboard = dynamic(() => import("./whiteboard"), { ssr: false })

export function WhiteboardDocument({
  documentId,
  editable,
  header,
}: {
  documentId: string
  editable: boolean
  header: React.ReactNode
}) {
  const provider = useDocumentSync(documentId, !editable)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <div className="min-w-0 flex-1">{header}</div>
        {provider && <SyncBadge provider={provider} editable={editable} />}
      </div>
      <div className="relative min-h-0 flex-1">
        {provider && <Loaded provider={provider} editable={editable} />}
      </div>
    </div>
  )
}

// Waits for the first load so the canvas fits the real content on open.
function Loaded({ provider, editable }: { provider: SupabaseProvider; editable: boolean }) {
  const { loaded } = useSyncStatus(provider)
  if (!loaded) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>
  return <Whiteboard provider={provider} editable={editable} />
}
