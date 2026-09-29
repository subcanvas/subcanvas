// The files of pictures and videos removed from whiteboards in this tab,
// kept until nothing here can bring them back (lib/whiteboard/media-release
// says why that is when they can go).
//
// Undo can bring a node back for as long as its whiteboard is open here, so
// a whiteboard's files are let go of when it is left. A file on the
// clipboard can still be pasted onto another whiteboard, which copies it,
// so it waits until something else is copied, or the tab closes. The server
// removes only what the whiteboard no longer shows (app/api/media/release).

const BATCH = 100

const pending = new Map<string, Set<string>>()
const open = new Map<string, number>()
let onClipboard = new Set<string>()
let listening = false

export function mediaRemoved(whiteboardId: string, paths: string[]) {
  if (!paths.length) return
  const waiting = pending.get(whiteboardId) ?? new Set()
  for (const path of paths) waiting.add(path)
  pending.set(whiteboardId, waiting)
  listen()
}

// Brought back by undo or redo.
export function mediaReturned(whiteboardId: string, paths: string[]) {
  const waiting = pending.get(whiteboardId)
  if (!waiting) return
  for (const path of paths) waiting.delete(path)
  if (!waiting.size) pending.delete(whiteboardId)
}

// What was just copied. Whatever it replaced may now go.
export function mediaOnClipboard(paths: string[]) {
  onClipboard = new Set(paths)
  release(false)
}

// A whiteboard's canvas opened here. The function it returns closes it,
// which ends its undo history.
export function whiteboardOpened(whiteboardId: string) {
  open.set(whiteboardId, (open.get(whiteboardId) ?? 0) + 1)
  return () => {
    const count = (open.get(whiteboardId) ?? 1) - 1
    if (count > 0) open.set(whiteboardId, count)
    else open.delete(whiteboardId)
    release(false)
  }
}

// `closing`: the tab is going away, and its undo history and clipboard
// with it, so everything can go.
function release(closing: boolean) {
  for (const [whiteboardId, waiting] of pending) {
    if (!closing && open.has(whiteboardId)) continue
    const paths = [...waiting].filter((path) => closing || !onClipboard.has(path))
    for (const path of paths) waiting.delete(path)
    if (!waiting.size) pending.delete(whiteboardId)
    for (let at = 0; at < paths.length; at += BATCH)
      void fetch("/api/media/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whiteboardId, paths: paths.slice(at, at + BATCH) }),
        // Still sent while the tab closes.
        keepalive: true,
      }).catch(() => {})
  }
}

function listen() {
  if (listening || typeof window === "undefined") return
  listening = true
  // Not when the page is kept to come back to (the back-forward cache):
  // its undo history comes back with it.
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) release(true)
  })
}
