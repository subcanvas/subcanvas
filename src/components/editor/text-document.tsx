"use client"

import dynamic from "next/dynamic"

import { useDocumentSync, useSyncStatus } from "@/lib/sync/use-document-sync"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"

import type { TextDocumentContext } from "./document-link-block"
import { PresenceAvatars } from "./presence-avatars"
import { SyncBadge } from "./sync-badge"
import type { EditorUser } from "./text-editor"

// BlockNote touches the DOM on import, so it never renders on the server.
const TextEditor = dynamic(() => import("./text-editor"), { ssr: false })

export function TextDocument({
  documentId,
  user,
  editable,
  context,
  autoFocus = false,
  page,
}: {
  // On a page of its own, the document fills the area: a bar across the top
  // like the whiteboard's, and the title and text in one centered column.
  // Without this it is laid out for the side panel.
  page?: { header: React.ReactNode; title: React.ReactNode }
  documentId: string
  user: EditorUser
  editable: boolean
  context: Omit<TextDocumentContext, "documentId">
  autoFocus?: boolean
}) {
  const provider = useDocumentSync(documentId, !editable)
  if (!provider) return null

  const editor = (
    <Editor
      provider={provider}
      user={user}
      editable={editable}
      context={{ ...context, documentId }}
      autoFocus={autoFocus}
    />
  )

  if (page)
    return (
      <div className="flex flex-1 flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-sheet px-4 py-2">
          <div className="min-w-0 flex-1">{page.header}</div>
          <PresenceAvatars provider={provider} user={user} />
          <SyncBadge provider={provider} editable={editable} />
        </div>
        {/* The wide gutter is for block handles; a phone has none. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pt-12 pb-40 max-md:pt-6 max-md:[&_.bn-editor]:px-5! max-md:[&_.mx-13]:mx-5! max-md:[&_.px-13]:px-5!">
          {page.title}
          {editor}
        </div>
      </div>
    )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 px-13">
        <SyncBadge provider={provider} editable={editable} />
        <PresenceAvatars provider={provider} user={user} />
      </div>
      {editor}
    </div>
  )
}

// Waits for the first load so the editor never opens on an empty document
// and then jumps when content arrives.
function Editor({
  provider,
  user,
  editable,
  context,
  autoFocus,
}: {
  provider: SupabaseProvider
  user: EditorUser
  editable: boolean
  context: TextDocumentContext
  autoFocus: boolean
}) {
  const { loaded } = useSyncStatus(provider)
  if (!loaded)
    return <p className="px-13 text-sm text-muted-foreground">Loading…</p>

  return (
    <TextEditor
      provider={provider}
      user={user}
      editable={editable}
      context={context}
      autoFocus={autoFocus}
    />
  )
}
