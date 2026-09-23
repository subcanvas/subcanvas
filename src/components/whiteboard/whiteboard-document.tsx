"use client"

import dynamic from "next/dynamic"

import { PresenceAvatars } from "@/components/editor/presence-avatars"
import { SyncBadge } from "@/components/editor/sync-badge"
import { useDocumentSync, useSyncStatus } from "@/lib/sync/use-document-sync"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"

import type { WhiteboardProps } from "./whiteboard"

const Whiteboard = dynamic(() => import("./whiteboard"), { ssr: false })

type Shared = Pick<WhiteboardProps, "editable" | "context" | "user">

export function WhiteboardDocument({
  documentId,
  breadcrumb,
  title,
  actions,
  ...shared
}: Shared & {
  documentId: string
  breadcrumb: React.ReactNode
  title: React.ReactNode
  actions?: React.ReactNode
}) {
  const { editable } = shared
  const provider = useDocumentSync(documentId, !editable)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* A narrow canvas has no room beside the toolbar, so the trail stays up here. */}
          <div className="md:hidden">{breadcrumb}</div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">{title}</div>
            {provider && <SyncBadge provider={provider} editable={editable} />}
          </div>
        </div>
        {provider && <PresenceAvatars provider={provider} user={shared.user} />}
        {actions}
      </div>
      <div className="relative min-h-0 flex-1">
        {/* The trail goes on the canvas itself (see Whiteboard), which keeps it
            clear of the tools when the object panel opens. */}
        {provider && <Loaded provider={provider} breadcrumb={breadcrumb} {...shared} />}
      </div>
    </div>
  )
}

// Waits for the first load so the canvas fits the real content on open.
function Loaded({
  provider,
  ...shared
}: Shared & { provider: SupabaseProvider; breadcrumb: React.ReactNode }) {
  const { loaded } = useSyncStatus(provider)
  if (!loaded) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>
  return <Whiteboard provider={provider} {...shared} />
}
