"use client"

import "@blocknote/shadcn/style.css"

import { withCollaboration } from "@blocknote/core/yjs"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import { useEffect } from "react"

import type { SupabaseProvider } from "@/lib/sync/supabase-provider"

export type EditorUser = { name: string; color: string }

// The BlockNote content of a text document lives in this fragment.
export const TEXT_FRAGMENT = "blocknote"

export default function TextEditor({
  provider,
  user,
  editable,
  autoFocus = false,
}: {
  provider: SupabaseProvider
  user: EditorUser
  editable: boolean
  autoFocus?: boolean
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

  useEffect(() => {
    if (!autoFocus || !editable) return
    // BlockNoteView attaches the editor's DOM in its own effect, after this one.
    const timer = setTimeout(() => editor.focus(), 50)
    return () => clearTimeout(timer)
  }, [autoFocus, editable, editor])

  return <BlockNoteView editor={editor} editable={editable} theme="light" />
}
