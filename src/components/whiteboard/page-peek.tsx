"use client"

import { ArrowUpRight } from "lucide-react"
import { useRouter } from "next/navigation"

import { TextDocument } from "@/components/editor/text-document"
import type { EditorUser } from "@/components/editor/text-editor"
import { ItemIconMark } from "@/components/item-icon"
import { useProjectAddresses } from "@/components/project-addresses"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useDocumentMeta } from "@/lib/use-document-meta"
import type { WhiteboardContext } from "@/lib/whiteboard/description-document"

// A page an object holds, opened in a pop-up over the whiteboard: the
// object's open mode is `modal` (R4.8). The same page as in the side panel,
// with more room; Open as page goes to it on its own.
export function PagePeek({
  docId,
  editable,
  context,
  user,
  onClose,
}: {
  docId: string
  // May write in it: someone who may edit, whether or not the whiteboard is
  // locked, since a lock keeps the layout and not the notes.
  editable: boolean
  context: WhiteboardContext
  user: EditorUser
  onClose: () => void
}) {
  const router = useRouter()
  const addresses = useProjectAddresses()
  const meta = useDocumentMeta(docId)
  const via = [...context.via, context.whiteboardId]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        // A page, not a question: wide, tall, and laid out like the panel.
        className="flex h-[min(85vh,56rem)] flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <header className="flex items-center gap-2 border-b border-rule py-2 pr-12 pl-4">
          <DialogTitle className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
            {meta && <ItemIconMark icon={meta.icon} className="size-4 text-base" />}
            <span className="truncate">{meta?.title ?? "Loading…"}</span>
          </DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClose()
              router.push(addresses.href(docId, via))
            }}
          >
            <ArrowUpRight />
            Open as page
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          <TextDocument
            key={docId}
            documentId={docId}
            user={user}
            editable={editable}
            context={{ orgId: context.orgId, projectId: context.projectId, slug: context.slug, via }}
            autoFocus={false}
            source={meta?.source ?? null}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
