"use client"

import { FileText, Workflow } from "lucide-react"
import { useEffect, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import type { DocumentType } from "@/lib/tree"

export type PickedDocument = { id: string; title: string; type: DocumentType }

// Chooses an existing document to link to (R1.6).
export function DocumentPicker({
  open,
  onOpenChange,
  projectId,
  excludeId,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  // The document being edited: it cannot link to itself.
  excludeId: string
  onPick: (document: PickedDocument) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PickedDocument[] | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(async () => {
      let request = createClient()
        .from("documents")
        .select("id, title, type")
        .eq("project_id", projectId)
        .eq("kind", "standard")
        .is("deleted_at", null)
        .neq("id", excludeId)
        .order("updated_at", { ascending: false })
        .limit(20)
      const term = query.trim().replace(/[%_\\]/g, "\\$&")
      if (term) request = request.ilike("title", `%${term}%`)
      const { data } = await request
      if (!cancelled) setResults(data ?? [])
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, query, projectId, excludeId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link an existing document</DialogTitle>
          <DialogDescription>
            A link is not a copy. Edits show up everywhere the document is linked.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Search documents"
          placeholder="Search by title"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {results === null ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No documents found.</li>
          ) : (
            results.map((document) => {
              const Icon = document.type === "whiteboard" ? Workflow : FileText
              return (
                <li key={document.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(document)
                      onOpenChange(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{document.title}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
