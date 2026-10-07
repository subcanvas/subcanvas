"use client"

import "@blocknote/shadcn/style.css"
import "katex/dist/katex.min.css"

import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core"
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions"
import { en } from "@blocknote/core/locales"
import { withCollaboration } from "@blocknote/core/yjs"
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import {
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
  multiColumnDropCursor,
  withMultiColumn,
} from "@blocknote/xl-multi-column"
import { Bookmark, FileText, Link2, ListTree, Lightbulb, Radical, Sigma, Workflow } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { prosemirrorToYXmlFragment } from "y-prosemirror"

import { importMermaid } from "@/app/[org]/[project]/import-actions"
import { DocumentPicker } from "@/components/document-picker"
import { useShowRefusal } from "@/components/limit-refusal"
import { limitMessage } from "@/lib/billing/limit"
import { reconcileLinks, type LinkedObject } from "@/lib/document-links"
import { createClient } from "@/lib/supabase/client"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"
import { TEXT_FRAGMENT } from "@/lib/sync/text-fragment"
import { useSyncStatus } from "@/lib/sync/use-document-sync"
import type { DocumentType } from "@/lib/tree"

import { createBookmark } from "./blocks/bookmark"
import { createCallout } from "./blocks/callout"
import { createEquation, inlineEquation } from "./blocks/equation"
import { createTableOfContents } from "./blocks/table-of-contents"
import { adopt, resolveFileUrl, uploader, useUploadCleanup } from "./media"
import { SideMenuWithMermaid, type MermaidBlock } from "./mermaid-block-item"
import {
  createDocumentLink,
  TextDocumentContextProvider,
  type TextDocumentContext,
} from "./document-link-block"

// `avatarUrl` is the profile picture others see beside this person's name
// in the document (PresenceAvatars); carets and cursors show the name.
export type EditorUser = { id: string; name: string; color: string; avatarUrl?: string | null }

// The app says picture, not image (REQUIREMENTS.md, glossary), so BlockNote's
// own words for its image block say so too. Search aliases are left alone.
function picturesNotImages<T>(value: T): T {
  if (typeof value === "string") return value.replace(/\bimage\b/g, "picture").replace(/\bImage\b/g, "Picture") as T
  if (Array.isArray(value) || value === null || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, picturesNotImages(inner)])) as T
}

// BlockNote files pictures, videos, audio and files under "Media"; the app
// keeps that word for the whiteboard's Media button, so the page's menu
// names the group for what it holds.
const EMBEDS_GROUP = "Pictures and more"

function dictionary() {
  const words = picturesNotImages(en)
  const slashMenu = Object.fromEntries(
    Object.entries(words.slash_menu).map(([key, item]) => [
      key,
      item.group === "Media" ? { ...item, group: EMBEDS_GROUP } : item,
    ])
  ) as typeof words.slash_menu
  return { ...words, slash_menu: slashMenu, multi_column: multiColumnLocales.en }
}

// Audio and other files are always refused on upload (./media.ts), so the
// menu does not offer blocks for them. The items carry BlockNote's key at
// runtime even though the React type leaves it out.
const REFUSED_BLOCKS = new Set(["audio", "file"])
function offered(item: DefaultReactSuggestionItem) {
  return !REFUSED_BLOCKS.has((item as { key?: string }).key ?? "")
}

// The slash menu draws a heading wherever the group changes, so items of
// one group must be next to each other: ours join BlockNote's groups at
// their ends, and the groups keep the order they first appear in.
function groupTogether(items: DefaultReactSuggestionItem[]) {
  const order = [...new Set(items.map((item) => item.group))]
  return order.flatMap((group) => items.filter((item) => item.group === group))
}

// The same blocks as the server's editor (lib/text/server-editor.ts): what
// one can write, the other must be able to read.
const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      documentLink: createDocumentLink(),
      callout: createCallout(),
      equation: createEquation(),
      bookmark: createBookmark(),
      tableOfContents: createTableOfContents(),
    },
    inlineContentSpecs: { ...defaultInlineContentSpecs, inlineEquation },
  })
)

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
  const showRefusal = useShowRefusal()
  const { resolvedTheme } = useTheme()
  const [picking, setPicking] = useState(false)

  // Pictures and videos are filed under this document (./media.ts).
  const home = { orgId: context.orgId, projectId: context.projectId, documentId: context.documentId }

  const editor = useCreateBlockNote(
    withCollaboration({
      schema,
      uploadFile: uploader(home, showRefusal),
      resolveFileUrl,
      dictionary: dictionary(),
      dropCursor: multiColumnDropCursor,
      collaboration: {
        provider,
        fragment: provider.doc.getXmlFragment(TEXT_FRAGMENT),
        user: { name: user.name, color: user.color },
        showCursorLabels: "activity",
      },
    }),
    [provider]
  )

  // A new document's first empty paragraph exists only in the editor until
  // something is typed; the shared document starts out with nothing at all.
  // Undoing that first typing then empties the shared document, the editor
  // puts a paragraph back to satisfy its schema, and that counts as a fresh
  // change: it wipes the redo stack, and what was undone can never be
  // redone. So once the document has loaded and is still empty, the
  // paragraph is written into it here, with an origin the undo manager does
  // not track. Undo now stops at "one empty paragraph" and redo survives.
  const { loaded } = useSyncStatus(provider)
  useEffect(() => {
    if (!editable || !loaded) return
    const fragment = provider.doc.getXmlFragment(TEXT_FRAGMENT)
    if (fragment.length > 0) return
    provider.doc.transact(() => {
      prosemirrorToYXmlFragment(editor.prosemirrorState.doc, fragment)
    }, "seed")
  }, [editable, loaded, editor, provider])

  useUploadCleanup(context.documentId, editor)

  // A picture that arrives from another document (pasted, dragged, or put
  // there by an agent) is copied to this one, so that its readers see it.
  const adopting = useRef(new Set<string>())
  useEffect(() => {
    if (!editable) return
    const here = { orgId: context.orgId, projectId: context.projectId, documentId: context.documentId }
    const check = () =>
      editor.forEachBlock((block) => {
        const url = (block.props as { url?: unknown }).url
        if (typeof url !== "string" || adopting.current.has(`${block.id} ${url}`)) return true
        adopting.current.add(`${block.id} ${url}`)
        void adopt(here, url).then((result) => {
          if (typeof result === "string") {
            if (editor.getBlock(block.id)) editor.updateBlock(block.id, { props: { url: result } } as never)
          } else if (result) toast.error(result.failed)
        })
        return true
      })
    check()
    return editor.onChange(check)
  }, [editable, editor, context.orgId, context.projectId, context.documentId])

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
    if (error) {
      const limit = limitMessage(error.code, error.message)
      return showRefusal(
        limit
          ? { error: limit, limit: true }
          : { error: error.code === "42501" ? "You do not have permission to create documents." : error.message }
      )
    }
    insertLink(data.id)
    router.refresh()
  }

  // A Mermaid code block drawn as a whiteboard inside this page. The code
  // stays, and a link to the whiteboard goes under it.
  async function drawMermaid(block: MermaidBlock) {
    const result = await importMermaid(
      { slug: context.slug, orgId: context.orgId, projectId: context.projectId },
      { kind: "document", id: context.documentId },
      block.text
    )
    if ("error" in result) return showRefusal(result)
    if (editor.getBlock(block.id))
      editor.insertBlocks([{ type: "documentLink", props: { docId: result.id! } }], block.id, "after")
    router.refresh()
    toast.success("Drawn as a whiteboard inside this page.", {
      description: result.notes?.length ? `Not drawn as written: ${result.notes.join(" ")}` : undefined,
    })
  }

  // Blocks for what Notion pages hold, so an imported page reads the same
  // here and can be written the same way.
  const blockItems = (): DefaultReactSuggestionItem[] => [
    {
      title: "Callout",
      subtext: "A shaded block with an emoji, to make a point stand out",
      aliases: ["callout", "note", "tip", "warning", "aside", "admonition"],
      group: "Basic blocks",
      icon: <Lightbulb size={18} />,
      onItemClick: () => void insertOrUpdateBlockForSlashMenu(editor, { type: "callout" }),
    },
    {
      title: "Equation",
      subtext: "Display maths, written in TeX",
      aliases: ["equation", "math", "maths", "latex", "tex", "formula", "katex"],
      group: "Advanced",
      icon: <Sigma size={18} />,
      onItemClick: () => void insertOrUpdateBlockForSlashMenu(editor, { type: "equation" }),
    },
    {
      title: "Inline equation",
      subtext: "Maths inside a line of text",
      aliases: ["inline math", "inline equation", "latex", "tex"],
      group: "Advanced",
      icon: <Radical size={18} />,
      onItemClick: () => editor.insertInlineContent([{ type: "inlineEquation", props: { latex: "" } }, " "]),
    },
    {
      title: "Bookmark",
      subtext: "A link shown as a card",
      aliases: ["bookmark", "link", "url", "web", "embed"],
      group: EMBEDS_GROUP,
      icon: <Bookmark size={18} />,
      onItemClick: () => void insertOrUpdateBlockForSlashMenu(editor, { type: "bookmark" }),
    },
    {
      title: "Table of contents",
      subtext: "The document's headings, kept current",
      aliases: ["toc", "table of contents", "outline", "contents"],
      group: "Others",
      icon: <ListTree size={18} />,
      onItemClick: () => void insertOrUpdateBlockForSlashMenu(editor, { type: "tableOfContents" }),
    },
  ]

  const documentItems = (): DefaultReactSuggestionItem[] => [
    {
      title: "Page",
      subtext: "Create a page inside this one",
      aliases: ["page", "text", "document", "doc", "nested", "subpage"],
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
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        slashMenu={false}
        sideMenu={false}
      >
        <SideMenuWithMermaid onDraw={editable ? (block) => void drawMermaid(block) : undefined} />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              groupTogether([
                ...getDefaultReactSlashMenuItems(editor).filter(offered),
                ...blockItems(),
                ...getMultiColumnSlashMenuItems(editor),
                ...documentItems(),
              ]),
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
