"use client"

import { Download } from "lucide-react"
import { useEffect, useRef, useState } from "react"

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
import { ExportError, exportSource } from "@/lib/export/source"
import { buildProjectZip, type ExportedZip, type ExportProgress } from "@/lib/export/zip"
import { formatBytes } from "@/lib/whiteboard/media"

// Takes a whole project out as one zip (docs/EXPORTING.md). The zip is put
// together here, in the browser, from documents the server converts a batch
// at a time and files fetched straight from Storage, so a project of any
// size works on any host.

type Stage =
  | { step: "ready" }
  | { step: "exporting"; progress: ExportProgress | null }
  | { step: "done"; zip: ExportedZip; url: string }
  | { step: "failed"; error: string }

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`

// Hands the zip to the browser to save, as a link to it would.
function save(url: string, fileName: string) {
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
}

export function ExportDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string
  projectName: string
  onClose: () => void
}) {
  const [stage, setStage] = useState<Stage>({ step: "ready" })
  const running = useRef<AbortController | null>(null)
  const saved = useRef<string | null>(null)

  // Closing the dialog stops an export that is running and lets go of the zip.
  useEffect(
    () => () => {
      running.current?.abort()
      if (saved.current) URL.revokeObjectURL(saved.current)
    },
    []
  )

  async function run() {
    const controller = new AbortController()
    running.current = controller
    setStage({ step: "exporting", progress: null })
    try {
      const zip = await buildProjectZip({
        source: exportSource(projectId, controller.signal),
        origin: window.location.origin,
        signal: controller.signal,
        onProgress: (progress) => setStage({ step: "exporting", progress }),
      })
      const url = URL.createObjectURL(zip.blob)
      saved.current = url
      setStage({ step: "done", zip, url })
      save(url, zip.fileName)
    } catch (error) {
      if (controller.signal.aborted) return
      setStage({
        step: "failed",
        error: error instanceof ExportError ? error.message : "The export could not be finished. Try again.",
      })
    } finally {
      running.current = null
    }
  }

  function stop() {
    running.current?.abort()
    onClose()
  }

  const busy = stage.step === "exporting"

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent showCloseButton={!busy} className="sm:max-w-md">
        {stage.step === "ready" && (
          <div className="flex min-w-0 flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Export “{projectName}”</DialogTitle>
              <DialogDescription>
                One zip of everything in this project that you can read, in folders as the tree has them.
              </DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-1.5 rounded-lg border border-rule bg-paper p-3 text-xs leading-relaxed text-graphite">
              <li>Pages are Markdown files.</li>
              <li>Whiteboards are SVG pictures, each with a JSON file of its boxes, arrows and groups and what each one holds.</li>
              <li>Pictures and videos are files beside the documents that show them.</li>
              <li>Import files brings the pages back from the zip.</li>
            </ul>
            <DialogFooter className="items-center">
              <p className="mr-auto text-xs text-graphite">It is put together in this tab.</p>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <Button autoFocus onClick={() => void run()}>
                <Download />
                Export
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage.step === "exporting" && (
          <div className="flex min-w-0 flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Exporting…</DialogTitle>
              <DialogDescription role="status">
                {stage.progress
                  ? `${stage.progress.documents.toLocaleString("en")} of ${count(stage.progress.totalDocuments, "document")}${
                      stage.progress.totalFiles
                        ? `, ${stage.progress.files.toLocaleString("en")} of ${count(stage.progress.totalFiles, "picture or video", "pictures and videos")}`
                        : ""
                    }`
                  : "Reading the project…"}
              </DialogDescription>
            </DialogHeader>
            <div
              role="progressbar"
              aria-label="Export progress"
              aria-valuemin={0}
              aria-valuemax={stage.progress?.totalDocuments ?? 0}
              aria-valuenow={stage.progress?.documents ?? 0}
              className="h-1.5 overflow-hidden rounded-full bg-rule"
            >
              <div
                className="h-full rounded-full bg-cobalt transition-[width]"
                style={{
                  width: `${stage.progress?.totalDocuments ? (stage.progress.documents / stage.progress.totalDocuments) * 100 : 0}%`,
                }}
              />
            </div>
            <DialogFooter className="items-center">
              <p className="mr-auto text-xs text-graphite">Keep this tab open until the zip is saved.</p>
              <Button variant="outline" onClick={stop}>
                Stop
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage.step === "done" && (
          <div className="flex min-w-0 flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Exported</DialogTitle>
              <DialogDescription>
                {stage.zip.fileName} ({formatBytes(stage.zip.blob.size)}) holds {count(stage.zip.documents, "document")}
                {stage.zip.files ? ` and ${count(stage.zip.files, "picture or video", "pictures and videos")}` : ""}. Your
                browser saves it with your other downloads.
              </DialogDescription>
            </DialogHeader>
            {stage.zip.leftOut.length > 0 && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-sm">
                  {count(stage.zip.leftOut.length, "file was", "files were")} left out. README.txt in the zip lists{" "}
                  {stage.zip.leftOut.length === 1 ? "it" : "them"} too.
                </p>
                <ul
                  aria-label="Left out"
                  className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-rule bg-paper p-3 text-xs leading-relaxed text-graphite"
                >
                  {stage.zip.leftOut.map((item) => (
                    <li key={item.path} className="break-words">
                      {item.path}: {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => save(stage.url, stage.zip.fileName)}>
                <Download />
                Save again
              </Button>
              <DialogClose render={<Button>Done</Button>} />
            </DialogFooter>
          </div>
        )}

        {stage.step === "failed" && (
          <div className="flex min-w-0 flex-col gap-5">
            <DialogHeader>
              <DialogTitle>The export stopped</DialogTitle>
              <DialogDescription>Nothing was saved.</DialogDescription>
            </DialogHeader>
            <p role="alert" className="text-sm text-destructive">
              {stage.error}
            </p>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Close</Button>} />
              <Button onClick={() => void run()}>Try again</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
