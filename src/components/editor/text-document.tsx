"use client"

import dynamic from "next/dynamic"

import { useDocumentSync, useSyncStatus } from "@/lib/sync/use-document-sync"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"

import { SyncBadge } from "./sync-badge"
import type { EditorUser } from "./text-editor"

// BlockNote touches the DOM on import, so it never renders on the server.
const TextEditor = dynamic(() => import("./text-editor"), { ssr: false })

export function TextDocument({
  documentId,
  user,
  editable,
}: {
  documentId: string
  user: EditorUser
  editable: boolean
}) {
  const provider = useDocumentSync(documentId, !editable)
  if (!provider) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="px-13">
        <SyncBadge provider={provider} editable={editable} />
      </div>
      <Editor provider={provider} user={user} editable={editable} />
    </div>
  )
}

// Waits for the first load so the editor never opens on an empty document
// and then jumps when content arrives.
function Editor({
  provider,
  user,
  editable,
}: {
  provider: SupabaseProvider
  user: EditorUser
  editable: boolean
}) {
  const { loaded } = useSyncStatus(provider)
  if (!loaded)
    return <p className="px-13 text-sm text-muted-foreground">Loading…</p>

  return <TextEditor provider={provider} user={user} editable={editable} />
}
