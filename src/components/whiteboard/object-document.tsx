"use client"

import { ArrowUpRight, FileText, Link2, Unlink, Workflow } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { DocumentPicker } from "@/components/document-picker"
import { TextDocument } from "@/components/editor/text-document"
import type { EditorUser } from "@/components/editor/text-editor"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { documentHref } from "@/lib/navigation"
import { createClient } from "@/lib/supabase/client"
import { useDocumentMeta } from "@/lib/use-document-meta"
import {
  createChildWhiteboard,
  ensureDescriptionDocument,
  type WhiteboardContext,
} from "@/lib/whiteboard/description-document"
import type { DocType, OpenMode } from "@/lib/whiteboard/schema"

export type DocumentPatch = {
  docId: string | null
  docType: DocType | null
}

// The document held by a node, edge, or group (R4.1): a description
// written right here, a nested whiteboard, or a link to a document that
// lives elsewhere.
export function ObjectDocument({
  objectId,
  objectTitle,
  docId,
  docType,
  openMode,
  editable,
  context,
  user,
  onChange,
  onOpenModeChange,
}: {
  objectId: string
  objectTitle: string
  docId: string | null
  docType: DocType | null
  openMode: OpenMode
  editable: boolean
  context: WhiteboardContext
  user: EditorUser
  onChange: (patch: DocumentPatch) => void
  onOpenModeChange: (mode: OpenMode) => void
}) {
  const router = useRouter()
  const meta = useDocumentMeta(docId)
  const [pending, startTransition] = useTransition()
  const [picking, setPicking] = useState(false)
  // Focus the editor only when this person just created the document.
  const [justCreated, setJustCreated] = useState(false)

  function create(type: DocType) {
    startTransition(async () => {
      const result =
        type === "text"
          ? await ensureDescriptionDocument(createClient(), context, objectId, objectTitle)
          : await createChildWhiteboard(createClient(), context, objectId, objectTitle)
      if ("error" in result) return void toast.error(result.error)

      setJustCreated(type === "text")
      onChange({ docId: result.id, docType: type })
      // A new whiteboard appears in the sidebar tree.
      if (type === "whiteboard") router.refresh()
    })
  }

  const open = () =>
    docId &&
    router.push(
      documentHref({ slug: context.slug, projectId: context.projectId }, docId, [
        ...context.via,
        context.whiteboardId,
      ])
    )

  const Icon = docType === "whiteboard" ? Workflow : FileText

  return (
    <section aria-label="Document" className="flex flex-1 flex-col gap-3 border-t border-rule py-4">
      <div className="flex items-center gap-1 px-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-[10px] tracking-wide text-graphite uppercase">Inside</span>
          <h3 className="truncate text-sm font-medium">
            {!docId
              ? "Nothing yet"
              : meta === undefined
                ? "Loading…"
                : meta === null
                  ? "Missing document"
                  : meta.kind === "description"
                    ? "Description"
                    : meta.title}
          </h3>
        </div>
        {docId && meta && (
          <Button variant="ghost" size="sm" onClick={open}>
            <ArrowUpRight />
            Open
          </Button>
        )}
        {docId && editable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ docId: null, docType: null })}
          >
            <Unlink />
            Detach
          </Button>
        )}
      </div>

      {!docId ? (
        editable ? (
          <div className="flex flex-col gap-2 px-4">
            <button
              type="button"
              disabled={pending}
              onClick={() => create("text")}
              className="min-h-24 cursor-text rounded-lg border border-dashed border-input p-3 text-left text-sm text-graphite outline-none transition-colors hover:border-cobalt hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {pending ? "Creating…" : "Write a description…"}
            </button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={pending} onClick={() => create("whiteboard")}>
                <Workflow />
                New whiteboard inside
              </Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setPicking(true)}>
                <Link2 />
                Link existing
              </Button>
            </div>
          </div>
        ) : (
          <p className="px-4 text-sm text-muted-foreground">No document.</p>
        )
      ) : meta === undefined ? null : meta === null ? (
        <p className="px-4 text-sm text-muted-foreground">
          This document was deleted, or you do not have access to it.
        </p>
      ) : meta.trashed ? (
        <p className="px-4 text-sm text-muted-foreground">
          “{meta.title}” is in the trash. Restore it to see it here.
        </p>
      ) : meta.type === "whiteboard" ? (
        <button
          type="button"
          onClick={open}
          className="sheet-stack mx-4 mb-2 flex items-center gap-3 rounded-lg border border-rule bg-sheet p-4 text-left outline-none transition-[translate,border-color] [--stack-edge:var(--blueline)] hover:-translate-y-0.5 hover:border-cobalt focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-10 items-center justify-center rounded-md bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{meta.title}</span>
            <span className="text-xs text-graphite">A whiteboard. Click to go inside.</span>
          </span>
        </button>
      ) : (
        <>
          {editable && (
            <div className="flex flex-col gap-2 px-4">
              <Label className="text-xs text-graphite">Double-clicking the object opens this</Label>
              <ToggleGroup
                aria-label="Double-click opens it"
                variant="outline"
                size="sm"
                spacing={0}
                value={[openMode]}
                onValueChange={(next) => {
                  const picked = next.find((item) => item !== openMode) as OpenMode | undefined
                  if (picked) onOpenModeChange(picked)
                }}
              >
                <ToggleGroupItem value="panel" className="flex-1 data-pressed:border-cobalt data-pressed:bg-accent data-pressed:text-ink">
                  In this panel
                </ToggleGroupItem>
                <ToggleGroupItem value="navigate" className="flex-1 data-pressed:border-cobalt data-pressed:bg-accent data-pressed:text-ink">
                  As a full page
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          {/* A narrower gutter than the full page, leaving room for block handles. */}
          <div className="[&_.bn-editor]:px-11! [&_.px-13]:px-11!">
            <TextDocument
              key={docId}
              documentId={docId}
              user={user}
              editable={editable}
              context={{
                orgId: context.orgId,
                projectId: context.projectId,
                slug: context.slug,
                via: [...context.via, context.whiteboardId],
              }}
              autoFocus={justCreated}
              source={meta.source}
            />
          </div>
        </>
      )}

      <DocumentPicker
        open={picking}
        onOpenChange={setPicking}
        projectId={context.projectId}
        excludeId={context.whiteboardId}
        onPick={(document) => onChange({ docId: document.id, docType: document.type })}
      />
    </section>
  )
}
