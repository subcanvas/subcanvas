"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

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
  deleteDocumentForever,
  listReferences,
  restoreDocument,
  type ActionResult,
  type ProjectRef,
} from "../tree-actions"

export function TrashRow({
  project,
  id,
  title,
  canEdit,
}: {
  project: ProjectRef
  id: string
  title: string
  canEdit: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [references, setReferences] = useState<string[]>([])

  function run(action: () => Promise<ActionResult>, message: string) {
    startTransition(async () => {
      const result = await action()
      if ("error" in result) toast.error(result.error)
      else toast.success(message)
      setConfirming(false)
    })
  }

  return (
    <li className="flex items-center gap-2 px-4 py-2">
      <span className="flex-1 truncate font-medium">{title}</span>
      {canEdit && (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => restoreDocument(project, id), "Restored.")}
          >
            Restore
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setReferences(await listReferences(id))
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
            <DialogTitle>Delete “{title}” forever?</DialogTitle>
            <DialogDescription>
              This also deletes every document nested inside it. It cannot be undone.
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
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteDocumentForever(project, id), "Deleted.")}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
