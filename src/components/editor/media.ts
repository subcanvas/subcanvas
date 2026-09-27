"use client"

import { useEffect } from "react"
import { toast } from "sonner"

import { classifyMedia, mediaDocumentId, mediaHref, mediaPath, parseMediaPath, type MediaHome } from "@/lib/whiteboard/media"
import { copyMediaTo, uploadMedia } from "@/lib/whiteboard/media-upload"
import { rememberLocalMedia, signedMediaUrl } from "@/lib/whiteboard/media-urls"

// Pictures and videos in a text document. They are kept where a
// whiteboard's are, filed under the document (lib/whiteboard/media.ts), so
// the same rules decide who may see them, and the org's storage cap counts
// them. A block holds the file's lasting address, /api/media/<path>, which
// anyone can open; the editor shows it through a signed address instead,
// asked for in batches, so that a page of pictures is one request.

const PREFIX = "/api/media/"

// The stored file behind an address a block holds, or null for any other.
export function mediaPathOf(url: string) {
  return url.startsWith(PREFIX) ? parseMediaPath(url.slice(PREFIX.length)) : null
}

export async function resolveFileUrl(url: string) {
  const path = mediaPathOf(url)
  return (path && (await signedMediaUrl(path))) || url
}

// The editor open on each document, for taking back the empty block of a
// file that was not taken. The editor is made after its upload function, so
// it is found here when it is needed rather than handed over.
type Editor = { getBlock: (id: string) => unknown; removeBlocks: (ids: string[]) => void }
const editors = new Map<string, Editor>()

export function useUploadCleanup(documentId: string, editor: Editor) {
  useEffect(() => {
    editors.set(documentId, editor)
    return () => {
      if (editors.get(documentId) === editor) editors.delete(documentId)
    }
  }, [documentId, editor])
}

function removeBlock(documentId: string, blockId: string) {
  const editor = editors.get(documentId)
  if (editor?.getBlock(blockId)) editor.removeBlocks([blockId])
}

// What BlockNote calls with a file that was pasted, dropped, or picked. It
// has already put an empty block where the file goes; a file that is not
// taken leaves nothing behind but a message saying why.
export function uploader(home: MediaHome) {
  return async (file: File, blockId?: string) => {
    try {
      const format = classifyMedia(file)
      if ("error" in format) throw new Error(`${file.name} ${format.error} Other files cannot be added yet.`)
      const path = mediaPath(home, crypto.randomUUID(), format.extension)
      await uploadMedia(file, path, { onProgress: () => {}, signal: new AbortController().signal })
      // Whoever added it already has it.
      rememberLocalMedia(path, URL.createObjectURL(file))
      return mediaHref(path)
    } catch (error) {
      if (blockId) removeBlock(home.documentId, blockId)
      const message = error instanceof Error ? error.message : "The upload failed. Try again."
      toast.error(message.startsWith(file.name) ? message : `${file.name} was not added. ${message}`)
      throw error
    }
  }
}

// A picture copied here from another document is filed under that one, and
// this document's readers may not be able to see it. It gets a copy of its
// own, as a pasted picture does on a whiteboard. Null when there is nothing
// to do; the copy's address when there was; `failed` when the file could not
// be copied, which leaves the block as it is.
export async function adopt(home: MediaHome, url: string): Promise<string | null | { failed: string }> {
  const path = mediaPathOf(url)
  if (!path || mediaDocumentId(path) === home.documentId) return null
  const copy = await copyMediaTo(home, path)
  if (typeof copy === "string") return mediaHref(copy)
  return { failed: copy?.full ?? "This picture belongs to a document you cannot read, so it was not copied here." }
}
