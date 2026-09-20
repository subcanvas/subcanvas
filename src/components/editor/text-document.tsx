"use client"

import dynamic from "next/dynamic"

import { useDocumentSync, useSyncStatus } from "@/lib/sync/use-document-sync"
import type { DocumentSource } from "@/lib/github/source"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"

import type { TextDocumentContext } from "./document-link-block"
import { PresenceAvatars } from "./presence-avatars"
import { SourceBar } from "./source-bar"
import { SyncBadge } from "./sync-badge"
import type { EditorUser } from "./text-editor"

// BlockNote touches the DOM on import, so it never renders on the server.
const TextEditor = dynamic(() => import("./text-editor"), { ssr: false })

export function TextDocument({
  documentId,
  user,
  editable: mayEdit,
  locked = false,
  context,
  autoFocus = false,
  source = null,
  page,
}: {
  // On a page of its own, the document fills the area: a bar across the top
  // like the whiteboard's, and the title and text in one centered column.
  // Without this it is laid out for the side panel.
  page?: { breadcrumb: React.ReactNode; actions?: React.ReactNode; title: React.ReactNode }
  documentId: string
  user: EditorUser
  editable: boolean
  // Read-only for now, by this person's choice (a whiteboard in view mode).
  // Unlike `editable`, it leaves the connection a writer's: providers are
  // shared and keep the role they were opened with, so one opened read-only
  // would go on dropping edits after the switch back to edit mode.
  locked?: boolean
  context: Omit<TextDocumentContext, "documentId">
  autoFocus?: boolean
  // Set when the text was imported. Its repository owns it, so nobody edits
  // it here, whatever their role.
  source?: DocumentSource | null
}) {
  const editable = mayEdit && !source
  const provider = useDocumentSync(documentId, !editable)
  if (!provider) return null

  const editor = (
    <Editor
      provider={provider}
      user={user}
      editable={editable && !locked}
      context={{ ...context, documentId }}
      autoFocus={autoFocus}
    />
  )

  if (page)
    return (
      <div className="flex flex-1 flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-sheet px-4 py-2">
          {/* The trail ends with this page's name, and the save state sits beside it. */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {page.breadcrumb}
            <SyncBadge provider={provider} editable={editable} />
          </div>
          <PresenceAvatars provider={provider} user={user} />
          {page.actions}
        </div>
        {/* The wide gutter is for block handles; a phone has none. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pt-12 pb-40 max-md:pt-6 max-md:[&_.bn-editor]:px-5! max-md:[&_.mx-13]:mx-5! max-md:[&_.px-13]:px-5!">
          {page.title}
          {source && <SourceBar source={source} />}
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
      {source && <SourceBar source={source} />}
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
