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
        {/* On the canvas, level with the toolbar, and never wide enough to reach it. */}
        <div className="absolute top-[15px] left-4 z-10 hidden h-[42px] max-w-[calc(50%-12rem)] items-center overflow-hidden rounded-xl border border-rule bg-sheet px-3 shadow-sm md:flex">
          {breadcrumb}
        </div>
        {provider && <Loaded provider={provider} {...shared} />}
      </div>
    </div>
  )
}

// Waits for the first load so the canvas fits the real content on open.
function Loaded({ provider, ...shared }: Shared & { provider: SupabaseProvider }) {
  const { loaded } = useSyncStatus(provider)
  if (!loaded) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>
  return <Whiteboard provider={provider} {...shared} />
}
