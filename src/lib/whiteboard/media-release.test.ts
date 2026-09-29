import { describe, expect, it } from "vitest"
import * as Y from "yjs"

import { mediaObjectsOf, unshownMedia } from "./media-release"
import { nodesMap, toYMap } from "./schema"

const ORG = "00000000-0000-4000-8000-000000000001"
const PROJECT = "00000000-0000-4000-8000-000000000002"
const BOARD = "00000000-0000-4000-8000-000000000003"
const OTHER = "00000000-0000-4000-8000-000000000004"
const file = (document: string, n: number, extension = "png") =>
  `${ORG}/${PROJECT}/${document}/00000000-0000-4000-8000-00000000010${n}.${extension}`

function board(...paths: string[]) {
  const doc = new Y.Doc()
  paths.forEach((mediaPath, index) =>
    nodesMap(doc).set(`n${index}`, toYMap({ kind: "media", x: 0, y: 0, title: "", mediaPath }))
  )
  return doc
}

describe("which files a whiteboard can let go of", () => {
  it("lets go of a file no node shows", () => {
    expect(unshownMedia(board(file(BOARD, 1)), BOARD, [file(BOARD, 2)])).toEqual([file(BOARD, 2)])
  })

  it("keeps a file another node still shows, such as a copy", () => {
    expect(unshownMedia(board(file(BOARD, 1)), BOARD, [file(BOARD, 1)])).toEqual([])
  })

  it("never lets go of a file filed under another document, or of something that is not a file", () => {
    expect(unshownMedia(board(), BOARD, [file(OTHER, 1), "../../etc/passwd", `${ORG}/x.png`])).toEqual([])
  })

  it("names each file once, in the bucket its kind is kept in", () => {
    const paths = unshownMedia(board(), BOARD, [file(BOARD, 1), file(BOARD, 1), file(BOARD, 2, "mp4")])
    expect(mediaObjectsOf(paths)).toEqual([
      { bucket_id: "media-images", name: file(BOARD, 1) },
      { bucket_id: "media-videos", name: file(BOARD, 2, "mp4") },
    ])
  })
})
