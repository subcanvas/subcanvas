"use client"

import { FileText, FileUp, Folder, FolderUp, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { checkImport, importBatch } from "@/app/[org]/[project]/import-actions"
import type { ProjectRef } from "@/app/[org]/[project]/tree-actions"
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
import { makeBatches, type ImportBatch } from "@/lib/import/batches"
import { collect, CollectError, pickedFromDrop, pickedFromInput, type PickedFile } from "@/lib/import/collect"
import { planImport, tooManyDocuments, type ImportPlan, type Skipped, type SkipReason } from "@/lib/import/plan"
import { documentHref } from "@/lib/navigation"
import type { Container } from "@/lib/tree"
import { cn } from "@/lib/utils"

// Brings notes from other apps into a project: Markdown files, a folder of
// them, or the zip an app exports. The files are read and planned here, in
// the browser; the person sees what will happen, then it goes to the server
// a batch at a time. See docs/IMPORTING.md.

export type ImportTarget = { container: Container; name: string }

type Prepared = { plan: ImportPlan; batches: ImportBatch[]; skipped: Skipped[] }
type Stage =
  | { step: "choose"; error?: string }
  | { step: "reading" }
  | ({ step: "preview" } & Prepared)
  | ({ step: "importing"; imported: number } & Prepared)
  | ({ step: "done"; imported: number; plainText: string[]; error?: string; limit?: true } & Prepared)

const ACCEPT = ".md,.markdown,.mdown,.txt,.csv,.zip"

const REASONS: Record<SkipReason, string> = {
  unsupported: "not a kind of file that can be imported",
  image: "image files",
  "too-large": "too large for one document",
  "table-too-large": "tables too large for one document",
  unreadable: "could not be read",
  protected: "protected with a password",
  "unsafe-path": "their path leads outside the zip",
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`

export function ImportDialog({
  project,
  target,
  dropped,
  canUpgrade,
  onClose,
}: {
  project: ProjectRef
  target: ImportTarget
  // Files dropped on the tree, still being listed. Without them the dialog
  // opens by asking for some.
  dropped: Promise<PickedFile[]> | null
  canUpgrade: boolean
  onClose: () => void
}) {
  const [stage, setStage] = useState<Stage>(dropped ? { step: "reading" } : { step: "choose" })
  const [dragging, setDragging] = useState(false)
  // The ref is what the running loop reads; the state is what the button shows.
  const stopped = useRef(false)
  const [stopping, setStopping] = useState(false)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  function prepare(picking: Promise<PickedFile[]> | PickedFile[]) {
    setStage({ step: "reading" })
    void read(picking)
  }

  async function read(picking: Promise<PickedFile[]> | PickedFile[]) {
    try {
      const { files, skipped } = await collect(await picking)
      const plan = planImport(files, {
        intoDocument: target.container.kind === "document",
        attachments: skipped.map((file) => file.path),
        newId: () => crypto.randomUUID(),
        hrefFor: (id) => documentHref(project, id),
      })
      const tooMany = tooManyDocuments(plan.documents.length)
      if (tooMany) return setStage({ step: "choose", error: tooMany })
      setStage({ step: "preview", plan, batches: makeBatches(plan), skipped: [...skipped, ...plan.skipped] })
    } catch (error) {
      setStage({
        step: "choose",
        error: error instanceof CollectError ? error.message : "These files could not be read.",
      })
    }
  }

  useEffect(() => {
    // The dialog opened already showing that it is reading these.
    if (dropped) void read(dropped)
    // Only what was dropped when the dialog opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run({ plan, batches, skipped }: Prepared) {
    const prepared = { plan, batches, skipped }
    stopped.current = false
    setStage({ step: "importing", imported: 0, ...prepared })

    let imported = 0
    const plainText: string[] = []
    const finish = (failure?: { error: string; limit?: true }) =>
      setStage({ step: "done", imported, plainText, ...failure, ...prepared })

    const allowed = await checkImport(project, plan.documents.length)
    if ("error" in allowed) return finish(allowed)
    for (const batch of batches) {
      if (stopped.current) return finish()
      let result: Awaited<ReturnType<typeof importBatch>>
      try {
        result = await importBatch(project, target.container, batch)
      } catch {
        result = { error: "The connection to the server was lost." }
      }
      if ("error" in result) return finish(result)
      imported += batch.documents.length
      plainText.push(...(result.plainText ?? []))
      setStage({ step: "importing", imported, ...prepared })
    }
    finish()
  }

  const busy = stage.step === "reading" || stage.step === "importing"

  return (
    <Dialog
      open
      // While it runs, the way out is Stop, which ends it between two batches.
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <DialogContent showCloseButton={!busy} className="sm:max-w-md">
        {(stage.step === "choose" || stage.step === "reading") && (
          <div className="flex min-w-0 flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Import files</DialogTitle>
              <DialogDescription>
                Markdown and text files become documents in {target.name}, and folders stay folders.
                A zip works too: a Notion export (Markdown &amp; CSV), an Obsidian vault, a wiki.
              </DialogDescription>
            </DialogHeader>

            <div
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                if (!busy) prepare(pickedFromDrop(event.dataTransfer))
              }}
              className={cn(
                "flex flex-col items-center gap-3 rounded-lg border border-dashed border-rule bg-paper px-4 py-6 text-center",
                dragging && "border-cobalt bg-cobalt/5"
              )}
            >
              {stage.step === "reading" ? (
                <p role="status" className="flex items-center gap-2 py-2.5 text-sm text-graphite">
                  <Loader2 className="size-4 animate-spin" />
                  Reading the files…
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" onClick={() => filesInput.current?.click()}>
                      <FileUp />
                      Choose files or a zip
                    </Button>
                    <Button variant="outline" onClick={() => folderInput.current?.click()}>
                      <FolderUp />
                      Choose a folder
                    </Button>
                  </div>
                  <p className="text-xs text-graphite">Or drop them here.</p>
                </>
              )}
              {/* The buttons above are the way to these; they are not shown or read out. */}
              <input
                ref={filesInput}
                type="file"
                multiple
                accept={ACCEPT}
                hidden
                onChange={(event) => event.target.files?.length && prepare(pickedFromInput(event.target.files))}
              />
              <input
                // React does not know this attribute, which makes the picker take a folder.
                ref={(node) => {
                  node?.setAttribute("webkitdirectory", "")
                  folderInput.current = node
                }}
                type="file"
                hidden
                onChange={(event) => event.target.files?.length && prepare(pickedFromInput(event.target.files))}
              />
            </div>

            {stage.step === "choose" && stage.error && (
              <p role="alert" className="text-sm text-destructive">
                {stage.error}
              </p>
            )}
            <p className="text-xs leading-relaxed text-graphite">
              Everything is read in your browser. Only the text of the notes is sent.
            </p>
          </div>
        )}

        {stage.step === "preview" && (
          <div className="flex min-w-0 flex-col gap-5">
            <DialogHeader>
              <DialogTitle>{stage.plan.documents.length ? "Ready to import" : "Nothing to import"}</DialogTitle>
              <DialogDescription>
                {stage.plan.documents.length
                  ? `${count(stage.plan.documents.length, "document")}${stage.plan.folders.length ? ` in ${count(stage.plan.folders.length, "folder")}` : ""} will be added to ${target.name}.`
                  : "None of these files are Markdown, text, or CSV."}
              </DialogDescription>
            </DialogHeader>
            {stage.plan.documents.length > 0 && (
              <ul
                aria-label="What will be imported"
                className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-lg border border-rule bg-paper p-3 text-xs leading-relaxed"
              >
                {outlineOf(stage.plan).map((item) => (
                  <li
                    key={item.id}
                    className={cn("flex items-center gap-1.5", item.folder && "text-graphite")}
                    style={{ paddingLeft: item.depth * 12 }}
                  >
                    {item.folder ? <Folder className="size-3 shrink-0" /> : <FileText className="size-3 shrink-0 text-graphite" />}
                    <span className="truncate">{item.name}</span>
                  </li>
                ))}
              </ul>
            )}
            <Notes notes={notesOf(stage)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setStage({ step: "choose" })}>
                Back
              </Button>
              {stage.plan.documents.length > 0 && (
                <Button autoFocus onClick={() => void run(stage)}>
                  Import {count(stage.plan.documents.length, "document")}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {stage.step === "importing" && (
          <div className="flex min-w-0 flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Importing…</DialogTitle>
              <DialogDescription role="status">
                {stage.imported.toLocaleString("en")} of {count(stage.plan.documents.length, "document")}
              </DialogDescription>
            </DialogHeader>
            <div
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={stage.plan.documents.length}
              aria-valuenow={stage.imported}
              className="h-1.5 overflow-hidden rounded-full bg-rule"
            >
              <div
                className="h-full rounded-full bg-cobalt transition-[width]"
                style={{ width: `${(stage.imported / stage.plan.documents.length) * 100}%` }}
              />
            </div>
            <DialogFooter className="items-center">
              <p className="mr-auto text-xs text-graphite">You can keep this tab in the background.</p>
              <Button
                variant="outline"
                disabled={stopping}
                onClick={() => {
                  stopped.current = true
                  setStopping(true)
                }}
              >
                {stopping ? "Stopping…" : "Stop"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage.step === "done" && (
          <div className="flex min-w-0 flex-col gap-5">
            <DialogHeader>
              <DialogTitle>
                {stage.imported === stage.plan.documents.length
                  ? "Imported"
                  : stage.error
                    ? "The import stopped early"
                    : "Import stopped"}
              </DialogTitle>
              <DialogDescription>
                {stage.imported === stage.plan.documents.length
                  ? `${count(stage.imported, "document is", "documents are")} in ${target.name}.`
                  : `${stage.imported.toLocaleString("en")} of ${count(stage.plan.documents.length, "document")} made it. What was imported stays; the rest was not added.`}
              </DialogDescription>
            </DialogHeader>
            {stage.error && (
              <p role="alert" className="text-sm text-destructive">
                {stage.error}
              </p>
            )}
            <Notes
              notes={[
                ...stage.plainText.map((title) => `“${title}” could not be converted, and was imported as plain text.`),
                ...(stage.imported ? notesOf(stage, true) : []),
              ]}
            />
            <DialogFooter>
              {stage.limit && canUpgrade && (
                <Button variant="outline" nativeButton={false} render={<Link href={`/${project.slug}/settings/billing`} />}>
                  Upgrade
                </Button>
              )}
              {stage.imported > 0 ? (
                <Button
                  nativeButton={false}
                  render={<Link href={documentHref(project, stage.plan.documents[0].id)} onClick={onClose} />}
                >
                  Open “{stage.plan.documents[0].title}”
                </Button>
              ) : (
                <DialogClose render={<Button variant="outline">Close</Button>} />
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// The plan as the tree will show it: folders first, then documents, each
// under what holds it.
function outlineOf(plan: ImportPlan) {
  type Item = { id: string; name: string; folder: boolean; depth: number }
  const items = [
    ...plan.folders.map((folder) => ({ id: folder.id, name: folder.name, folder: true, parent: folder.parent })),
    ...plan.documents.map((document) => ({ id: document.id, name: document.title, folder: false, parent: document.parent })),
  ]
  const outline: Item[] = []
  const add = (parentId: string | null, depth: number) => {
    for (const item of items)
      if ((item.parent.kind === "target" ? null : item.parent.id) === parentId) {
        outline.push({ id: item.id, name: item.name, folder: item.folder, depth })
        add(item.id, depth + 1)
      }
  }
  add(null, 0)
  return outline
}

// What the person should know that the counts do not say.
function notesOf({ plan, skipped }: Prepared, done = false) {
  const notes: string[] = []
  if (plan.localImages)
    notes.push(
      `${count(plan.localImages, "image")} in these notes ${done ? (plan.localImages === 1 ? "was" : "were") : "will"} not ${done ? "" : "be "}imported; image upload is coming. ${plan.localImages === 1 ? "Its description is" : "Their descriptions are"} kept in the text.`
    )
  if (plan.unlinked)
    notes.push(
      `${count(plan.unlinked, "link points", "links point")} at files that are not in this import, and ${done ? (plan.unlinked === 1 ? "is" : "are") : "will be"} plain text.`
    )
  const byReason = new Map<SkipReason, string[]>()
  for (const { path, reason } of skipped) byReason.set(reason, [...(byReason.get(reason) ?? []), path])
  for (const [reason, paths] of byReason) {
    const names = paths.slice(0, 3).map((path) => path.slice(path.lastIndexOf("/") + 1))
    notes.push(
      `${count(paths.length, "file")} skipped, ${REASONS[reason]}: ${names.join(", ")}${paths.length > names.length ? ", …" : ""}`
    )
  }
  return notes
}

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null
  return (
    <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-lg border border-rule bg-paper p-3 text-xs leading-relaxed text-graphite">
      {notes.map((note) => (
        <li key={note} className="break-words">
          {note}
        </li>
      ))}
    </ul>
  )
}
