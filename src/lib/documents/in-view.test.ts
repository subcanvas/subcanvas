import { describe, expect, it } from "vitest"

import { inView, type InViewDocument, type InViewFolder } from "./in-view"

// The same tree and the same cases as the database's tests of the rule
// (supabase/tests/database/trash.test.sql and out_of_view.test.sql): a
// whiteboard board > child > grand, with a box's description on board, and a
// folder outer > inner holding filed > deep.

const NOW = "2026-09-30T00:00:00Z"

function tree(trashed: string[] = []) {
  const deleted = (id: string) => (trashed.includes(id) ? NOW : null)
  const folders: InViewFolder[] = [
    { id: "outer", parent_folder_id: null, deleted_at: deleted("outer") },
    { id: "inner", parent_folder_id: "outer", deleted_at: deleted("inner") },
  ]
  const at = (id: string, folder: string | null, parent: string | null): InViewDocument => ({
    id,
    folder_id: folder,
    parent_document_id: parent,
    deleted_at: deleted(id),
  })
  const documents = [
    at("board", null, null),
    at("child", null, "board"),
    at("grand", null, "child"),
    at("notes", null, "board"),
    at("filed", "inner", null),
    at("deep", null, "filed"),
  ]
  return inView(folders, documents)
}

const sorted = (set: Set<string>) => [...set].sort()

describe("what is in view", () => {
  it("is everything while nothing is in the trash, descriptions included", () => {
    const live = tree()
    expect(sorted(live.documents)).toEqual(["board", "child", "deep", "filed", "grand", "notes"])
    expect(sorted(live.folders)).toEqual(["inner", "outer"])
  })

  it("leaves out a trashed document and everything nested in it", () => {
    expect(sorted(tree(["child"]).documents)).toEqual(["board", "deep", "filed", "notes"])
  })

  it("leaves out everything in a trashed folder, however deep", () => {
    const live = tree(["outer"])
    expect(sorted(live.folders)).toEqual([])
    expect(sorted(live.documents)).toEqual(["board", "child", "grand", "notes"])
  })

  it("leaves out a folder inside a trashed one, and what it holds", () => {
    const live = tree(["inner"])
    expect(sorted(live.folders)).toEqual(["outer"])
    expect(live.documents.has("filed")).toBe(false)
    expect(live.documents.has("deep")).toBe(false)
  })

  it("leaves out what is nested under a trashed whiteboard, its descriptions too", () => {
    expect(sorted(tree(["board"]).documents)).toEqual(["deep", "filed"])
  })

  it("leaves out what has no place in the lists, as the database walks from the top", () => {
    const live = inView([], [{ id: "lost", folder_id: "gone", parent_document_id: null, deleted_at: null }])
    expect(live.documents.size).toBe(0)
  })
})
