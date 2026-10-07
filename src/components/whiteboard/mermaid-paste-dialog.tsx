"use client"

import { Loader2 } from "lucide-react"
import { useMemo, useState } from "react"

import { MermaidSummary } from "@/components/mermaid-summary"
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
import type { Diagram } from "@/lib/mermaid/diagram"
import { parseMermaid } from "@/lib/mermaid/parse"

// Mermaid pasted on an open whiteboard. Text is not something a whiteboard
// takes on its own, so it asks first, and says what will be drawn.
export function MermaidPasteDialog({
  text,
  onAdd,
  onClose,
}: {
  text: string
  onAdd: (diagram: Diagram) => Promise<void>
  onClose: () => void
}) {
  const parsed = useMemo(() => parseMermaid(text), [text])
  const [pending, setPending] = useState(false)

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add this Mermaid diagram?</DialogTitle>
          <DialogDescription>
            It is drawn beside what is on this whiteboard, as boxes and arrows you can move, open and edit.
          </DialogDescription>
        </DialogHeader>
        <MermaidSummary parsed={parsed} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending}>Cancel</Button>} />
          <Button
            autoFocus
            disabled={!parsed.ok || pending}
            onClick={async () => {
              if (!parsed.ok) return
              setPending(true)
              await onAdd(parsed.diagram)
              onClose()
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            Add to whiteboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
