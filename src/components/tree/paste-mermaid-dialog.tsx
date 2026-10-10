"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import { importMermaid } from "@/app/[org]/[project]/import-actions"
import type { ProjectRef } from "@/app/[org]/[project]/tree-actions"
import { LimitRefusal } from "@/components/limit-refusal"
import { MermaidSummary } from "@/components/mermaid-summary"
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
import { MAX_MERMAID_LENGTH, parseMermaid } from "@/lib/mermaid/parse"
import { documentPermalink } from "@/lib/navigation"

import type { ImportTarget } from "./import-dialog"

const PLACEHOLDER = "flowchart LR\n  Browser --> API\n  API --> DB[(Database)]"

// Mermaid copied from anywhere (a README, a chat with an agent), as a new
// whiteboard of real boxes and arrows. What will be drawn, and what will
// not, is said before anything is made.
export function PasteMermaidDialog({
  project,
  target,
  onClose,
}: {
  project: ProjectRef
  target: ImportTarget
  onClose: () => void
}) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [failure, setFailure] = useState<{ error: string; limit?: true } | null>(null)
  const [pending, startTransition] = useTransition()
  const parsed = useMemo(() => (text.trim() ? parseMermaid(text) : null), [text])

  function create() {
    startTransition(async () => {
      const result = await importMermaid(project, target.container, text)
      if ("error" in result) return setFailure(result)
      onClose()
      router.push(documentPermalink(project, result.id!))
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
            <DialogTitle>Paste Mermaid</DialogTitle>
            <DialogDescription>
              It becomes a new whiteboard in {target.name}, with a box for each node and an arrow for each link.
              Flowcharts, sequence diagrams and ER diagrams.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="paste-mermaid">Mermaid</Label>
            <Textarea
              id="paste-mermaid"
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setFailure(null)
              }}
              required
              autoFocus
              maxLength={MAX_MERMAID_LENGTH}
              spellCheck={false}
              disabled={pending}
              placeholder={PLACEHOLDER}
              className="h-56 max-h-[50vh] resize-none overflow-y-auto font-mono text-[13px] [field-sizing:fixed]"
            />
          </div>
          {parsed && <MermaidSummary parsed={parsed} />}
          {failure && <LimitRefusal refused={failure} />}
          <DialogFooter>
            <Button type="submit" disabled={pending || !parsed?.ok}>
              {pending && <Loader2 className="animate-spin" />}
              Create whiteboard
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
