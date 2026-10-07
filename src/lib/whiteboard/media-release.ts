import type * as Y from "yjs"

import type { MediaObject } from "@/lib/documents/media-cleanup"

import { MEDIA_BUCKETS, mediaDocumentId, mediaTypeOf, parseMediaPath } from "./media"
import { nodesMap } from "./schema"

// When the file of a removed picture or video can go.
//
// A file is filed under one whiteboard, and only that whiteboard's nodes
// show it: a copy pasted anywhere else gets a file of its own first. So once
// no node of its whiteboard shows it, and nobody can bring back one that
// did, nothing refers to it and it stops counting against the workspace.
//
// Whoever removed the node is the only one who can bring it back, with
// undo, and only while that whiteboard is open in their tab
// (components/whiteboard/media-release.ts waits for that). An agent has no
// undo, so its removals let go at once. Files also go when their whiteboard
// is deleted for good (media-cleanup.ts), whatever showed them.

// Of `candidates`, the files this whiteboard no longer shows: filed under
// it, and on none of its nodes.
export function unshownMedia(doc: Y.Doc, whiteboardId: string, candidates: string[]): string[] {
  const shown = new Set<unknown>([...nodesMap(doc).values()].map((node) => node.get("mediaPath")))
  return [...new Set(candidates)].filter(
    (path) => parseMediaPath(path) !== null && mediaDocumentId(path) === whiteboardId && !shown.has(path)
  )
}

export function mediaObjectsOf(paths: string[]): MediaObject[] {
  return paths.map((name) => ({ bucket_id: MEDIA_BUCKETS[mediaTypeOf(name)], name }))
}
