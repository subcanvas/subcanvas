"use client"

import "@blocknote/shadcn/style.css"

import { withCollaboration } from "@blocknote/core/yjs"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"

import type { SupabaseProvider } from "@/lib/sync/supabase-provider"

export type EditorUser = { name: string; color: string }

// The BlockNote content of a text document lives in this fragment.
export const TEXT_FRAGMENT = "blocknote"

export default function TextEditor({
  provider,
  user,
  editable,
}: {
  provider: SupabaseProvider
  user: EditorUser
  editable: boolean
}) {
  const editor = useCreateBlockNote(
    withCollaboration({
      collaboration: {
        provider,
        fragment: provider.doc.getXmlFragment(TEXT_FRAGMENT),
        user,
        showCursorLabels: "activity",
      },
    }),
    [provider]
  )

  return <BlockNoteView editor={editor} editable={editable} theme="light" />
}
