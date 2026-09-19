"use client"

import { Badge } from "@/components/ui/badge"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"
import { useSyncStatus } from "@/lib/sync/use-document-sync"

export function SyncBadge({
  provider,
  editable,
}: {
  provider: SupabaseProvider
  editable: boolean
}) {
  const { status, saveStatus } = useSyncStatus(provider)

  const label = !editable
    ? "View only"
    : status === "disconnected"
      ? "Offline. Changes are kept and will sync."
      : saveStatus === "error"
        ? "Could not save. Retrying…"
        : saveStatus === "saving"
          ? "Saving…"
          : "Saved"

  return (
    <span aria-live="polite">
      <Badge
        variant={
          status === "disconnected" || saveStatus === "error" ? "destructive" : "secondary"
        }
      >
        {label}
      </Badge>
    </span>
  )
}
