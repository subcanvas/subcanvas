import { createClient } from "@/lib/supabase/client"

import {
  MEDIA_BUCKETS,
  mediaPath,
  mediaTypeOf,
  storageFullMessage,
  UNKNOWN_MEDIA_SIZE,
  type MediaHome,
} from "./media"

// A file goes from the browser straight to Storage. It never passes through
// this app's server, whose host may cap a request at a few megabytes, and
// Storage checks the upload against row-level security and the bucket's own
// limits. Sent with XMLHttpRequest and not the Storage client, because only
// that reports how much has gone.
export async function uploadMedia(
  file: File,
  path: string,
  { onProgress, signal }: { onProgress: (fraction: number) => void; signal: AbortSignal }
) {
  const { data } = await createClient().auth.getSession()
  if (!data.session) throw new Error("You are signed out. Sign in and try again.")

  const bucket = MEDIA_BUCKETS[mediaTypeOf(path)]
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`)
    request.setRequestHeader("Authorization", `Bearer ${data.session.access_token}`)
    request.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
    request.setRequestHeader("Content-Type", file.type)
    // A stored file never changes, so whoever has it may keep it.
    request.setRequestHeader("Cache-Control", "max-age=31536000")
    request.setRequestHeader("x-upsert", "false")

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve()
      reject(new Error(uploadError(request)))
    }
    request.onerror = () => reject(new Error("The connection dropped before it finished."))
    request.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"))
    signal.addEventListener("abort", () => request.abort(), { once: true })
    request.send(file)
  })
}

// Storage has answered 400 to everything and put the real status in the
// body; newer versions use the status line. Both are read.
export function uploadError(request: Pick<XMLHttpRequest, "status" | "responseText">) {
  let status = request.status
  let message: unknown
  try {
    const body = JSON.parse(request.responseText) as { statusCode?: string; message?: unknown }
    status = Number(body.statusCode) || status
    message = body.message
  } catch {
    // Not JSON: the status line is all there is.
  }
  // Refused like row-level security, so it is told apart by its words.
  const full = storageFullMessage(message)
  if (full) return full
  if (status === 413) return "It is larger than this server accepts."
  if (status === 415) return "This server does not take that kind of file."
  // What Storage answers when row-level security says no.
  if (status === 400 || status === 401 || status === 403) return "You cannot add files to this whiteboard."
  return "The upload failed. Try again."
}

// A picture pasted from another whiteboard gets a file of its own here: a
// file is read by the readers of the whiteboard it is filed under, and those
// may not be this one's. Null when it cannot be copied, which is what
// happens when the person pasting cannot read the original, or `full` with
// what to tell them when the copy would take the org past its storage cap.
export async function copyMediaTo(home: MediaHome, path: string): Promise<string | null | { full: string }> {
  const copy = mediaPath(home, crypto.randomUUID(), path.slice(path.lastIndexOf(".") + 1))
  const { error } = await createClient().storage.from(MEDIA_BUCKETS[mediaTypeOf(path)]).copy(path, copy)
  if (!error) return copy
  const full = storageFullMessage(error.message)
  return full ? { full } : null
}

// A file's own size in pixels, read by letting the browser open it.
export function measureImage(objectUrl: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = objectUrl
  })
}

// A video this browser cannot open may still play for someone else, so it
// is not refused: it takes a usual shape, and a resize can fix it.
export function measureVideo(objectUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const video = document.createElement("video")
    const done = (size: { width: number; height: number }) => {
      clearTimeout(timer)
      video.removeAttribute("src")
      video.load()
      resolve(size.width && size.height ? size : UNKNOWN_MEDIA_SIZE)
    }
    const timer = setTimeout(() => done(UNKNOWN_MEDIA_SIZE), 4000)
    video.preload = "metadata"
    video.muted = true
    video.onloadedmetadata = () => done({ width: video.videoWidth, height: video.videoHeight })
    video.onerror = () => done(UNKNOWN_MEDIA_SIZE)
    video.src = objectUrl
  })
}
