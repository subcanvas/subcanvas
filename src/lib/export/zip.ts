import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate"

import { mediaTypeOf } from "@/lib/whiteboard/media"

import {
  claimName,
  folderOf,
  MANIFEST_FILE,
  README_FILE,
  relativeHref,
  safeName,
  type ExportLayout,
  type LaidOutDocument,
} from "./layout"
import type { ExportedMedia } from "./markdown"
import type { ExportedDocument, ProjectExport } from "./read"
import { manifestJson, readmeText, type LeftOut } from "./readme"
import { whiteboardFile } from "./whiteboard"

// A project's export, put together in the browser (docs/EXPORTING.md).
//
// The server converts documents a batch at a time, and each answer is small;
// pictures and videos come straight from Storage, one at a time, under the
// reader's own session, and never pass through the app. The zip is written
// as it goes, with fflate, into pieces of a Blob, which the browser may keep
// on disk. So nothing here depends on the size of the project: no request is
// larger than one batch, none takes longer than one batch does, and the page
// holds a few megabytes of the zip at a time.

export type ExportSource = {
  // The project and where everything goes: /api/projects/<id>/export.
  project: () => Promise<ProjectExport>
  // Some documents, converted: /api/projects/<id>/export/documents.
  documents: (ids: string[]) => AsyncIterable<ExportedDocument>
  // Signed addresses for files in Storage, null for one that cannot be had.
  sign: (paths: string[]) => Promise<Map<string, string | null>>
  download: (url: string) => Promise<Blob | null>
}

export type ExportProgress = { documents: number; totalDocuments: number; files: number; totalFiles: number }
export type ExportedZip = { blob: Blob; fileName: string; documents: number; files: number; leftOut: LeftOut[] }

// Documents asked for at once (the server takes up to 50).
const BATCH = 20
// Without the ZIP64 extension, which fflate does not write, a zip holds at
// most 4 GiB and 65,535 entries. This stops short of both.
const MAX_ZIP_BYTES = 4_000_000_000
const MAX_ENTRIES = 65_000
// The zip is kept in pieces of about this size.
const PIECE_BYTES = 8 * 1024 * 1024
// A file is read into the zip this much at a time.
const SLICE_BYTES = 4 * 1024 * 1024

const LOST = "the server could not send it"
const TOO_LARGE = "the zip would pass 4 GB, the most one zip can hold"
const TOO_MANY = "the zip would pass 65,000 files, the most one zip can hold"
const NOT_FETCHED = "could not be fetched from storage"

export class ZipWriter {
  private readonly zip: Zip
  private readonly pieces: Blob[] = []
  private pending: Uint8Array[] = []
  private pendingBytes = 0
  private failure: Error | null = null
  private blob: Blob | null = null
  bytes = 0
  entries = 0

  constructor() {
    this.zip = new Zip((error, chunk, final) => {
      if (error) {
        this.failure = error
        return
      }
      this.pending.push(chunk)
      this.pendingBytes += chunk.length
      this.bytes += chunk.length
      if (this.pendingBytes >= PIECE_BYTES || final) this.keep()
      if (final) this.blob = new Blob(this.pieces, { type: "application/zip" })
    })
  }

  // What has been written so far goes into a Blob, which the browser may
  // move out of the page's memory.
  private keep() {
    if (!this.pending.length) return
    this.pieces.push(new Blob(this.pending as BlobPart[]))
    this.pending = []
    this.pendingBytes = 0
  }

  private check() {
    if (this.failure) throw this.failure
  }

  directory(path: string) {
    const entry = new ZipPassThrough(`${path}/`)
    this.zip.add(entry)
    entry.push(new Uint8Array(0), true)
    this.entries++
    this.check()
  }

  text(path: string, text: string) {
    const entry = new ZipDeflate(path, { level: 6 })
    this.zip.add(entry)
    entry.push(strToU8(text), true)
    this.entries++
    this.check()
  }

  // Pictures and videos are already compressed, so they are stored as they are.
  async file(path: string, blob: Blob) {
    const entry = new ZipPassThrough(path)
    this.zip.add(entry)
    if (!blob.size) entry.push(new Uint8Array(0), true)
    for (let at = 0; at < blob.size; at += SLICE_BYTES) {
      const slice = new Uint8Array(await blob.slice(at, at + SLICE_BYTES).arrayBuffer())
      entry.push(slice, at + SLICE_BYTES >= blob.size)
    }
    this.entries++
    this.check()
  }

  finish(): Blob {
    this.zip.end()
    this.check()
    if (!this.blob) throw new Error("The zip was not finished.")
    return this.blob
  }
}

// The names already used in each folder of the export, which a picture's
// name must not take.
function takenNames(layout: ExportLayout) {
  const taken = new Map<string, Set<string>>([["", new Set([README_FILE.toLowerCase(), MANIFEST_FILE.toLowerCase()])]])
  const inFolder = (folder: string) => {
    if (!taken.has(folder)) taken.set(folder, new Set())
    return taken.get(folder)!
  }
  const add = (path: string) => inFolder(folderOf(path)).add(path.slice(path.lastIndexOf("/") + 1).toLowerCase())
  for (const folder of layout.folders) add(folder.path)
  for (const document of layout.documents) [document.path, ...document.files].forEach(add)
  return inFolder
}

// A picture's file name: what it is called in the document, else what it is.
function mediaName(media: ExportedMedia) {
  const extension = media.path.slice(media.path.lastIndexOf("."))
  const fallback = mediaTypeOf(media.path) === "video" ? "video" : "picture"
  return { stem: safeName(media.name.replace(/\.(png|jpe?g|webp|gif|avif|mp4|webm|mov)$/i, ""), fallback), extension }
}

// Points the addresses the server wrote at the files they became. Only
// addresses as a link or a picture holds them are touched: `](address)`.
function relink(markdown: string, replacements: [string, string][]) {
  let out = markdown
  for (const [address, href] of replacements) out = out.split(`](${address})`).join(`](${href})`)
  return out
}

// The main file of a document, which a link to it opens: a page's Markdown,
// a whiteboard's picture.
const fileOf = (document: LaidOutDocument) => document.files[0]

export async function buildProjectZip({
  source,
  origin,
  exportedAt = new Date(),
  signal,
  onProgress,
}: {
  source: ExportSource
  // This app's address, which the README names.
  origin: string
  exportedAt?: Date
  signal?: AbortSignal
  onProgress?: (progress: ExportProgress) => void
}): Promise<ExportedZip> {
  const stopped = () => {
    if (signal?.aborted) throw new DOMException("The export was stopped.", "AbortError")
  }
  const { project, layout } = await source.project()
  stopped()

  const writer = new ZipWriter()
  const leftOut: LeftOut[] = []
  const byId = new Map(layout.documents.map((document) => [document.id, document]))
  const taken = takenNames(layout)
  // Where each picture or video went, by its name in Storage; null when it
  // did not come. A file two documents show is in the zip once.
  const mediaFiles = new Map<string, string | null>()
  const progress: ExportProgress = { documents: 0, totalDocuments: layout.documents.length, files: 0, totalFiles: 0 }
  // What made it into the zip.
  let documentsWritten = 0
  let filesWritten = 0
  const report = () => onProgress?.({ ...progress })

  for (const folder of layout.folders) writer.directory(folder.path)
  report()

  // One batch. An answer may carry only some of it (the server stops at a
  // size a host allows), so what is missing is asked for again. When asking
  // fails twice, the documents are asked for one at a time, and one that
  // still cannot be had is left out: a single document too large to send,
  // or a connection that is gone.
  async function read(ids: string[]): Promise<ExportedDocument[]> {
    const found = new Map<string, ExportedDocument>()
    let pending = ids
    let size = ids.length
    let failures = 0
    while (pending.length) {
      const asking = pending.slice(0, size)
      try {
        let got = 0
        for await (const document of source.documents(asking)) {
          found.set(document.id, document)
          got++
        }
        if (!got) throw new Error("The answer held no documents.")
        failures = 0
      } catch {
        stopped()
        if (++failures === 2) {
          if (size > 1) size = 1
          else found.set(asking[0], { id: asking[0], error: LOST })
          failures = 0
        }
      }
      pending = pending.filter((id) => !found.has(id))
    }
    return ids.map((id) => found.get(id)!)
  }

  for (let at = 0; at < layout.documents.length; at += BATCH) {
    stopped()
    const exported = await read(layout.documents.slice(at, at + BATCH).map((document) => document.id))

    // Pictures and videos first, so that what shows them knows whether they came.
    const wanted: { path: string; file: string }[] = []
    for (const document of exported) {
      if ("error" in document) continue
      const home = byId.get(document.id)!
      for (const media of document.media) {
        if (mediaFiles.has(media.path)) continue
        const { stem, extension } = mediaName(media)
        const file = `${home.path}/${claimName(taken(home.path), stem, [extension])}${extension}`
        mediaFiles.set(media.path, file)
        wanted.push({ path: media.path, file })
      }
    }
    progress.totalFiles += wanted.length
    report()
    const signed = wanted.length ? await source.sign(wanted.map((media) => media.path)) : new Map<string, string | null>()
    for (const { path, file } of wanted) {
      stopped()
      const url = signed.get(path)
      const blob = url ? await source.download(url) : null
      const reason = !blob
        ? NOT_FETCHED
        : writer.bytes + blob.size > MAX_ZIP_BYTES
          ? TOO_LARGE
          : writer.entries >= MAX_ENTRIES
            ? TOO_MANY
            : null
      if (reason) {
        leftOut.push({ path: file, reason })
        mediaFiles.set(path, null)
      } else {
        await writer.file(file, blob!)
        filesWritten++
      }
      progress.files++
      report()
    }

    for (const document of exported) {
      const home = byId.get(document.id)!
      progress.documents++
      if ("error" in document) {
        leftOut.push(...home.files.map((path) => ({ path, reason: document.error })))
        continue
      }
      if (writer.entries + home.files.length > MAX_ENTRIES) {
        leftOut.push(...home.files.map((path) => ({ path, reason: TOO_MANY })))
        continue
      }
      documentsWritten++
      const mediaUrls = new Map(document.media.map((media) => [media.path, media.url]))
      if (document.type === "text") {
        const from = fileOf(home)
        const replacements: [string, string][] = []
        for (const [id, url] of Object.entries(document.links)) {
          const target = byId.get(id)
          if (target) replacements.push([url, relativeHref(from, fileOf(target))])
        }
        for (const media of document.media) {
          const file = mediaFiles.get(media.path)
          if (file) replacements.push([media.url, relativeHref(from, file)])
        }
        writer.text(from, relink(document.markdown, replacements))
      } else {
        writer.text(home.files[0], document.svg)
        const contents = whiteboardFile({
          id: document.id,
          title: document.title,
          contents: document,
          held: (id) => {
            const target = byId.get(id)
            const linked = document.links[id] ?? null
            return {
              title: target?.title ?? linked?.title ?? null,
              // A held whiteboard is read from its JSON file, a page from its Markdown.
              path: target ? target.files[target.type === "whiteboard" ? 1 : 0] : null,
              url: linked?.url ?? null,
            }
          },
          media: (path) => ({ path: mediaFiles.get(path) ?? null, url: mediaUrls.get(path) ?? `${origin}/api/media/${path}` }),
        })
        writer.text(home.files[1], JSON.stringify(contents, null, 2))
      }
    }
    report()
  }

  const about = { project, layout, origin, exportedAt, leftOut }
  writer.text(MANIFEST_FILE, manifestJson(about))
  writer.text(README_FILE, readmeText(about))
  return {
    blob: writer.finish(),
    fileName: `${safeName(project.name, "Project")}.zip`,
    documents: documentsWritten,
    files: filesWritten,
    leftOut,
  }
}
