"use client"

import { FileText, Folder, StickyNote, Workflow } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { useShowRefusal } from "@/components/limit-refusal"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import {
  deleteItemForever,
  listReferences,
  restoreItem,
  type ProjectRef,
} from "../tree-actions"

// `what` is what the row shows it as. Notes are the description of a box or
// an arrow that was deleted.
export type TrashedItem = {
  kind: "folder" | "document"
  id: string
  title: string
  what: "folder" | "whiteboard" | "text" | "notes"
}

const SHOWN_AS = {
  folder: { icon: Folder, label: "Folder" },
  whiteboard: { icon: Workflow, label: "Whiteboard" },
  text: { icon: FileText, label: "Page" },
  notes: { icon: StickyNote, label: "Description of a box or arrow" },
}

// Where a restored item went, when it could not go back where it was.
const RESTORED = {
  place: "Restored.",
  top: "Restored to the top of the project, since what it was in is still in the trash.",
  whiteboard: "Restored under the whiteboard it was on, since the box or arrow that held it is gone.",
}

export function TrashRow({
  project,
  item,
  canEdit,
}: {
  project: ProjectRef
  item: TrashedItem
  canEdit: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [references, setReferences] = useState<string[]>([])
  const showRefusal = useShowRefusal()
  const { icon: Icon, label } = SHOWN_AS[item.what]

  function restore() {
    startTransition(async () => {
      const result = await restoreItem(project, item.kind, item.id)
      if ("error" in result) showRefusal(result)
      else toast.success(RESTORED[result.restoredTo ?? "place"])
    })
  }

  function deleteForever() {
    startTransition(async () => {
      const result = await deleteItemForever(project, item.kind, item.id)
      if ("error" in result) showRefusal(result)
      else toast.success("Deleted.")
      setConfirming(false)
    })
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <Icon aria-hidden className={item.what === "whiteboard" ? "size-4 shrink-0 text-cobalt" : "size-4 shrink-0 text-graphite"} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{item.title}</span>
        <span className="text-xs text-graphite">{label}</span>
      </span>
      {canEdit && (
        <>
          <Button variant="outline" size="sm" disabled={pending} onClick={restore}>
            Restore
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setReferences(item.kind === "document" ? await listReferences(item.id) : [])
                setConfirming(true)
              })
            }
          >
            Delete forever
          </Button>
        </>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{item.title}” forever?</DialogTitle>
            <DialogDescription>
              {item.kind === "folder"
                ? "This also deletes everything in it: its folders, whiteboards and pages, and the pictures and videos on them. It cannot be undone."
                : "This also deletes every document nested inside it, and the pictures and videos on them. It cannot be undone."}
              {references.length > 0 && " These documents link to it and will lose the link:"}
            </DialogDescription>
          </DialogHeader>
          {references.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {references.map((title, index) => (
                <li key={index}>{title}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button variant="destructive" disabled={pending} onClick={deleteForever}>
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
