// Pictures and videos on a whiteboard: what may be uploaded, where a file is
// kept, and how big it is drawn. Pure, so the rules can be tested without a
// browser or a bucket. The buckets and their limits are created by the
// migration `canvas_media`, which repeats these numbers: Storage enforces
// them, this file only says no sooner and in plainer words.

export type MediaType = "image" | "video"

const MB = 1024 * 1024
export const MEDIA_MAX_BYTES: Record<MediaType, number> = { image: 10 * MB, video: 100 * MB }
export const MEDIA_BUCKETS: Record<MediaType, string> = { image: "media-images", video: "media-videos" }

// SVG is left out on purpose. It is a document that can carry script, the
// files are served by Storage where this app sets no headers, and an upload
// goes straight there, so there is no place to sanitize one.
const FORMATS: Record<string, { mediaType: MediaType; extension: string }> = {
  "image/png": { mediaType: "image", extension: "png" },
  "image/jpeg": { mediaType: "image", extension: "jpg" },
  "image/webp": { mediaType: "image", extension: "webp" },
  "image/gif": { mediaType: "image", extension: "gif" },
  "image/avif": { mediaType: "image", extension: "avif" },
  "video/mp4": { mediaType: "video", extension: "mp4" },
  "video/webm": { mediaType: "video", extension: "webm" },
  "video/quicktime": { mediaType: "video", extension: "mov" },
}

// For a file input's `accept`.
export const MEDIA_ACCEPT = Object.keys(FORMATS).join(",")

export type MediaFormat = { mediaType: MediaType; extension: string }

export function classifyMedia(file: { type: string; size: number }): MediaFormat | { error: string } {
  const format = FORMATS[file.type]
  if (!format) return { error: "is not a picture or video this whiteboard takes (PNG, JPEG, WebP, GIF, AVIF, MP4, WebM, MOV)." }
  if (file.size > MEDIA_MAX_BYTES[format.mediaType])
    return {
      error: `is larger than the ${MEDIA_MAX_BYTES[format.mediaType] / MB} MB a ${format.mediaType === "image" ? "picture" : "video"} can be.`,
    }
  return format
}

// --- Where a file is kept ---------------------------------------------------

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const EXTENSIONS = Object.values(FORMATS).map((format) => format.extension)
const PATH = new RegExp(`^${UUID}/${UUID}/(${UUID})/${UUID}\\.(${EXTENSIONS.join("|")})$`)

// <org>/<project>/<document>/<file>.<extension>. Row-level security reads the
// document out of it and gives the file the document's readers and editors.
export type MediaHome = { orgId: string; projectId: string; documentId: string }

export function mediaPath(home: MediaHome, fileId: string, extension: string) {
  return `${home.orgId}/${home.projectId}/${home.documentId}/${fileId}.${extension}`
}

// The path, if it is one this app would have written. Anything else in a
// shared document is treated as no file at all.
export function parseMediaPath(value: unknown) {
  return typeof value === "string" && PATH.test(value) ? value : null
}

export function mediaTypeOf(path: string): MediaType {
  const extension = path.slice(path.lastIndexOf(".") + 1)
  return Object.values(FORMATS).find((format) => format.extension === extension)?.mediaType ?? "image"
}

// The whiteboard whose readers can read the file.
export const mediaDocumentId = (path: string) => PATH.exec(path)?.[1] ?? null

// An address that stays the same, for a person to open: the app checks who
// is asking and sends them on to the file (app/api/media).
export const mediaHref = (path: string) => `/api/media/${path}`

// --- How big it is drawn ----------------------------------------------------

const MAX_WIDTH = 480
const MAX_HEIGHT = 360
export const MEDIA_MIN_SIDE = 48
// A video that this browser cannot read the size of is taken to be 16:9.
export const UNKNOWN_MEDIA_SIZE = { width: 1280, height: 720 }

// The file's own proportions, no larger than a comfortable size on the
// canvas and never larger than the file: a screenshot from a dense display
// has twice the pixels it needs.
export function fitMedia(natural: { width: number; height: number }) {
  const width = Math.max(1, natural.width)
  const height = Math.max(1, natural.height)
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height)
  // A banner a thousand times wider than tall still has to be something
  // that can be grabbed.
  return {
    width: Math.max(MEDIA_MIN_SIDE, Math.round(width * scale)),
    height: Math.max(MEDIA_MIN_SIDE, Math.round(height * scale)),
  }
}

const GAP = 24
const ROW_WIDTH = 1200

// Several files dropped at once: rows that read left to right, centered as a
// block on the point they were dropped at. One file lands centered on it.
export function layoutMedia(sizes: { width: number; height: number }[], center: { x: number; y: number }) {
  const places: { x: number; y: number }[] = []
  let x = 0
  let y = 0
  let rowHeight = 0
  let blockWidth = 0
  for (const size of sizes) {
    if (x > 0 && x + size.width > ROW_WIDTH) {
      x = 0
      y += rowHeight + GAP
      rowHeight = 0
    }
    places.push({ x, y })
    blockWidth = Math.max(blockWidth, x + size.width)
    x += size.width + GAP
    rowHeight = Math.max(rowHeight, size.height)
  }
  const blockHeight = y + rowHeight
  return places.map((place) => ({
    x: Math.round(center.x - blockWidth / 2 + place.x),
    y: Math.round(center.y - blockHeight / 2 + place.y),
  }))
}
