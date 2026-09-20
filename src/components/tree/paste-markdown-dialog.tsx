"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { importBatch } from "@/app/[org]/[project]/import-actions"
import type { ProjectRef } from "@/app/[org]/[project]/tree-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MAX_FILE_BYTES } from "@/lib/import/limits"
import { planImport } from "@/lib/import/plan"
import { documentHref } from "@/lib/navigation"

import type { ImportTarget } from "./import-dialog"

// Markdown copied from anywhere, as a new text document. It is an import of
// one file, so it is titled and converted exactly as a file would be.
export function PasteMarkdownDialog({
  project,
  target,
  canUpgrade,
  onClose,
}: {
  project: ProjectRef
  target: ImportTarget
  canUpgrade: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [markdown, setMarkdown] = useState("")
  const [failure, setFailure] = useState<{ error: string; limit?: true } | null>(null)
  const [pending, startTransition] = useTransition()

  function create() {
    startTransition(async () => {
      const { documents } = planImport([{ path: "Untitled.md", text: markdown }], {
        intoDocument: target.container.kind === "document",
        newId: () => crypto.randomUUID(),
        hrefFor: (id) => documentHref(project, id),
      })
      const result = await importBatch(project, target.container, { folders: [], documents })
      if ("error" in result) return setFailure(result)
      onClose()
      router.push(documentHref(project, documents[0].id))
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            create()
          }}
        >
          <DialogHeader>
            <DialogTitle>Paste Markdown</DialogTitle>
            <DialogDescription>
              It becomes a new text document in {target.name}. A heading on the first line is its title.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="paste-markdown">Markdown</Label>
            <Textarea
              id="paste-markdown"
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              required
              autoFocus
              maxLength={MAX_FILE_BYTES}
              spellCheck={false}
              disabled={pending}
              placeholder={"# Title\n\nPaste your notes here."}
              className="h-56 max-h-[50vh] resize-none overflow-y-auto font-mono text-[13px] [field-sizing:fixed]"
            />
          </div>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure.error}
            </p>
          )}
          <DialogFooter>
            {failure?.limit && canUpgrade && (
              <Button variant="outline" type="button" onClick={() => router.push(`/${project.slug}/settings/billing`)}>
                Upgrade
              </Button>
            )}
            <Button type="submit" disabled={pending || !markdown.trim()}>
              {pending && <Loader2 className="animate-spin" />}
              Create document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
