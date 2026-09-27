import { MEDIA_MAX_BYTES, mediaTypeOfName } from "@/lib/whiteboard/media"

import { MAX_FILE_BYTES, MAX_HTML_FILE_BYTES, MAX_INNER_ZIP_BYTES, MAX_TOTAL_BYTES } from "./limits"
import { isClutter, kindOf, safePath, type FileKind } from "./paths"
import type { PickedFile } from "./picked"
import type { Skipped, SourceFile } from "./plan"
import { listZip, readZipEntry, ZipError } from "./zip"

// Turns what a person picked or dropped (files, a folder, a zip) into the
// text files an import is planned from. Everything is read here, in the
// browser: a zip of any size never travels to the server, only the text of
// the notes inside it does. Pictures and videos the notes show go straight
// to Storage, as a person's uploads do; each is read only when it is sent.

export type MediaFile = { type: string; read: () => Promise<Blob | null> }
export type Collected = { files: SourceFile[]; skipped: Skipped[]; media: Map<string, MediaFile> }

// A picture or video this app keeps, and small enough to keep.
function mediaOf(path: string, size: number) {
  const type = mediaTypeOfName(path)
  if (!type) return null
  return size <= MEDIA_MAX_BYTES[type.startsWith("video/") ? "video" : "image"] ? type : null
}

// Thrown for what stops the whole import, with a message for the person.
export class CollectError extends Error {}

const decoder = new TextDecoder()

// The kinds of file that are notes, and how large each may be.
const limitOf = (kind: FileKind) =>
  kind === "markdown" || kind === "csv" ? MAX_FILE_BYTES : kind === "html" ? MAX_HTML_FILE_BYTES : null

export async function collect(picked: PickedFile[]): Promise<Collected> {
  const files: SourceFile[] = []
  const skipped: Skipped[] = []
  const media = new Map<string, MediaFile>()
  let total = 0

  const addText = (path: string, text: string) => {
    // A zero byte means this is not text, whatever the file is called.
    if (text.includes("\0")) return void skipped.push({ path, reason: "unreadable" })
    total += text.length
    if (total > MAX_TOTAL_BYTES)
      throw new CollectError("This is more text than one import takes. Import it a folder at a time.")
    files.push({ path, text })
  }

  async function addZip(zip: Blob, zipPath: string, inner: boolean) {
    let entries: Awaited<ReturnType<typeof listZip>>
    try {
      entries = await listZip(zip)
    } catch (error) {
      if (error instanceof ZipError) throw new CollectError(`${zipPath}: ${error.message}`)
      throw error
    }
    for (const entry of entries) {
      if (entry.directory) continue
      const path = safePath(entry.name)
      if (!path) {
        skipped.push({ path: entry.name, reason: "unsafe-path" })
        continue
      }
      if (isClutter(path)) continue
      const kind = kindOf(path)
      const limit = limitOf(kind)
      const type = entry.encrypted ? null : mediaOf(path, entry.size)
      if (type) {
        media.set(path, {
          type,
          read: async () => {
            const bytes = await readZipEntry(zip, entry, entry.size)
            return bytes ? new Blob([bytes as BlobPart], { type }) : null
          },
        })
      } else if (limit !== null) {
        if (entry.encrypted) skipped.push({ path, reason: "protected" })
        else if (entry.size > limit) skipped.push({ path, reason: "too-large" })
        else {
          const bytes = await readZipEntry(zip, entry, limit)
          if (bytes) addText(path, decoder.decode(bytes))
          else skipped.push({ path, reason: entry.method === 0 || entry.method === 8 ? "too-large" : "unreadable" })
        }
      } else if (kind === "zip" && !inner) {
        const bytes = await readZipEntry(zip, entry, MAX_INNER_ZIP_BYTES)
        if (bytes) await addZip(new Blob([bytes as BlobPart]), path, true)
        else skipped.push({ path, reason: "too-large" })
      } else skipped.push({ path, reason: kind === "image" ? "image" : "unsupported" })
    }
  }

  for (const { path: rawPath, file } of picked) {
    const path = safePath(rawPath)
    if (!path || isClutter(path)) continue
    const kind = kindOf(path)
    const limit = limitOf(kind)
    const type = mediaOf(path, file.size)
    if (type) media.set(path, { type, read: async () => file })
    else if (kind === "zip") await addZip(file, path, false)
    else if (limit === null) skipped.push({ path, reason: kind === "image" ? "image" : "unsupported" })
    else if (file.size > limit) skipped.push({ path, reason: "too-large" })
    else addText(path, await file.text())
  }
  return { files, skipped, media }
}
