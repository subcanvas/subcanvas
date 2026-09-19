"use client"

import type { SupabaseProvider } from "@/lib/sync/supabase-provider"
import { useSyncStatus } from "@/lib/sync/use-document-sync"
import { cn } from "@/lib/utils"

// Quiet when all is well, loud only when something needs attention: a dot
// and a word, not a badge competing with the document's title.
export function SyncBadge({
  provider,
  editable,
}: {
  provider: SupabaseProvider
  editable: boolean
}) {
  const { status, saveStatus } = useSyncStatus(provider)

  const state = !editable
    ? { tone: "idle", label: "View only" }
    : status === "disconnected"
      ? { tone: "problem", label: "Offline. Your changes are kept and will sync." }
      : saveStatus === "error"
        ? { tone: "problem", label: "Could not save. Trying again…" }
        : saveStatus === "saving"
          ? { tone: "busy", label: "Saving…" }
          : { tone: "ok", label: "Saved" }

  return (
    <span
      aria-live="polite"
      className={cn(
        "flex shrink-0 items-center gap-1.5 text-xs",
        state.tone === "problem" ? "font-medium text-destructive" : "text-graphite"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          state.tone === "ok" && "bg-[#2b9a66]",
          state.tone === "busy" && "animate-pulse bg-cobalt",
          state.tone === "idle" && "bg-graphite/50",
          state.tone === "problem" && "bg-destructive"
        )}
      />
      {state.label}
    </span>
  )
}
