import type * as Y from "yjs"

// A whiteboard can be locked, so nothing on it changes by accident: its
// boxes, arrows and groups stay where they are, as they are, holding what
// they hold, for everyone until an editor unlocks it (the ••• menu, or
// Locked in place of +). The pages they hold are documents of their own and
// can still be written in, the way a locked page in Notion still lets its
// subpages be edited: the layout is kept while the notes go on.
// It is a flag in the whiteboard's own Yjs document, so it reaches everyone
// with the whiteboard open as soon as it is set, and agents read it too
// (lib/mcp). It is not a permission: any editor can lift it.

export function metaMap(doc: Y.Doc) {
  return doc.getMap<unknown>("meta")
}

export const isLocked = (doc: Y.Doc) => metaMap(doc).get("locked") === true

export function setLocked(doc: Y.Doc, locked: boolean) {
  const meta = metaMap(doc)
  if (locked) meta.set("locked", true)
  else meta.delete("locked")
}

// What an agent is told when it tries to change a locked whiteboard.
export const LOCKED_REFUSAL =
  "This whiteboard is locked, so its nodes, arrows and groups cannot change, nor what they hold. Someone locked it in the app on purpose: ask them to unlock it (the ••• menu on the whiteboard) first. The pages its nodes and arrows already hold can still be edited."
