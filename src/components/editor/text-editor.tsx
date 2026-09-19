"use client"

import "@blocknote/shadcn/style.css"

import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core"
import { filterSuggestionItems } from "@blocknote/core/extensions"
import { withCollaboration } from "@blocknote/core/yjs"
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import { FileText, Link2, Workflow } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { DocumentPicker } from "@/components/document-picker"
import { limitMessage } from "@/lib/billing/limit"
import { reconcileLinks, type LinkedObject } from "@/lib/document-links"
import { createClient } from "@/lib/supabase/client"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"
import type { DocumentType } from "@/lib/tree"

import {
  createDocumentLink,
  TextDocumentContextProvider,
  type TextDocumentContext,
} from "./document-link-block"

export type EditorUser = { id: string; name: string; color: string }

// The BlockNote content of a text document lives in this fragment.
export const TEXT_FRAGMENT = "blocknote"

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, documentLink: createDocumentLink() },
})

export default function TextEditor({
  provider,
  user,
  editable,
  context,
  autoFocus = false,
}: {
  provider: SupabaseProvider
  user: EditorUser
  editable: boolean
  context: TextDocumentContext
  autoFocus?: boolean
}) {
  const router = useRouter()
  const [picking, setPicking] = useState(false)

  const editor = useCreateBlockNote(
    withCollaboration({
      schema,
      collaboration: {
        provider,
        fragment: provider.doc.getXmlFragment(TEXT_FRAGMENT),
        user: { name: user.name, color: user.color },
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

  // Keep the index of references in step with the content (R1.7).
  const lastLinks = useRef<string | null>(null)
  useEffect(() => {
    if (!editable) return
    let timer: ReturnType<typeof setTimeout>

    const reconcile = () => {
      const linked: LinkedObject[] = []
      editor.forEachBlock((block) => {
        if (block.type === "documentLink" && block.props.docId)
          linked.push({ objectId: block.id, docId: block.props.docId })
        return true
      })
      const signature = JSON.stringify(linked)
      if (signature === lastLinks.current) return
      lastLinks.current = signature
      void reconcileLinks(
        createClient(),
        { orgId: context.orgId, documentId: context.documentId },
        linked
      )
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(reconcile, 1500)
    }

    schedule()
    const unsubscribe = editor.onChange(schedule)
    return () => {
      clearTimeout(timer)
      unsubscribe?.()
    }
  }, [editable, editor, context.orgId, context.documentId])

  function insertLink(docId: string) {
    const cursor = editor.getTextCursorPosition().block
    const isEmptyParagraph =
      cursor.type === "paragraph" && Array.isArray(cursor.content) && cursor.content.length === 0
    const block = { type: "documentLink" as const, props: { docId } }
    if (isEmptyParagraph) editor.replaceBlocks([cursor], [block])
    else editor.insertBlocks([block], cursor, "after")
  }

  // A new document whose home is this one (R1.6).
  async function createInside(type: DocumentType) {
    const { data, error } = await createClient()
      .from("documents")
      .insert({
        org_id: context.orgId,
        project_id: context.projectId,
        type,
        parent_document_id: context.documentId,
        position: Date.now(),
      })
      .select("id")
      .single()
    if (error)
      return void toast.error(
        limitMessage(error.code) ??
          (error.code === "42501"
            ? "You do not have permission to create documents."
            : error.message)
      )
    insertLink(data.id)
    router.refresh()
  }

  const documentItems = (): DefaultReactSuggestionItem[] => [
    {
      title: "Text document",
      subtext: "Create a text document inside this one",
      aliases: ["page", "doc", "nested", "subpage"],
      group: "Documents",
      icon: <FileText size={18} />,
      onItemClick: () => void createInside("text"),
    },
    {
      title: "Whiteboard",
      subtext: "Create a whiteboard inside this one",
      aliases: ["diagram", "canvas", "board", "flow"],
      group: "Documents",
      icon: <Workflow size={18} />,
      onItemClick: () => void createInside("whiteboard"),
    },
    {
      title: "Link to document",
      subtext: "Link a document that lives elsewhere",
      aliases: ["reference", "embed", "mention"],
      group: "Documents",
      icon: <Link2 size={18} />,
      onItemClick: () => setPicking(true),
    },
  ]

  return (
    <TextDocumentContextProvider value={context}>
      <BlockNoteView editor={editor} editable={editable} theme="light" slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [...getDefaultReactSlashMenuItems(editor), ...documentItems()],
              query
            )
          }
        />
      </BlockNoteView>
      <DocumentPicker
        open={picking}
        onOpenChange={setPicking}
        projectId={context.projectId}
        excludeId={context.documentId}
        onPick={(document) => insertLink(document.id)}
      />
    </TextDocumentContextProvider>
  )
}
