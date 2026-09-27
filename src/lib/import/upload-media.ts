"use client"

import { storageFullMessage } from "@/lib/whiteboard/media"
import { uploadMedia } from "@/lib/whiteboard/media-upload"

import type { MediaFile } from "./collect"
import type { PlannedUpload } from "./plan"

// The pictures and videos of one batch of imported documents, sent straight
// to Storage now that the documents they are filed under exist. The same
// upload a person's paste makes, with the same checks: row-level security,
// the bucket's limits, and the org's storage cap.

// Enough to keep a connection busy without starving the rest of the page.
const AT_ONCE = 3

export type UploadOutcome = { failed: number; message?: string; full?: boolean }

export async function uploadImportMedia(
  uploads: PlannedUpload[],
  media: Map<string, MediaFile>,
  onEach: () => void,
  signal: AbortSignal
): Promise<UploadOutcome> {
  const queue = [...uploads]
  const outcome: UploadOutcome = { failed: 0 }

  const next = async (): Promise<void> => {
    const upload = queue.shift()
    if (!upload) return
    // Once the org's storage is full, nothing more will fit.
    if (outcome.full || signal.aborted) {
      outcome.failed++
      onEach()
      return next()
    }
    try {
      const file = media.get(upload.source)
      const blob = file && (await file.read())
      if (!file || !blob) throw new Error("It could not be read from the import.")
      const name = upload.source.slice(upload.source.lastIndexOf("/") + 1)
      await uploadMedia(new File([blob], name, { type: file.type }), upload.path, { onProgress: () => {}, signal })
    } catch (error) {
      outcome.failed++
      const message = error instanceof Error ? error.message : String(error)
      if (storageFullMessage(message)) outcome.full = true
      outcome.message ??= message
    }
    onEach()
    return next()
  }
  await Promise.all(Array.from({ length: AT_ONCE }, next))
  return outcome
}
