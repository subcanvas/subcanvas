import { describe, expect, it } from "vitest"

import {
  classifyMedia,
  fitMedia,
  formatBytes,
  storageFullMessage,
  layoutMedia,
  MEDIA_MAX_BYTES,
  mediaDocumentId,
  mediaPath,
  mediaTypeOf,
  parseMediaPath,
} from "./media"

const home = {
  orgId: "00000000-0000-4000-8000-0000000000a1",
  projectId: "00000000-0000-4000-8000-0000000000b1",
  documentId: "00000000-0000-4000-8000-0000000000d1",
}
const fileId = "00000000-0000-4000-8000-0000000000f1"

describe("classifyMedia", () => {
  it("takes pictures and videos up to their own limits", () => {
    expect(classifyMedia({ type: "image/jpeg", size: MEDIA_MAX_BYTES.image })).toEqual({ mediaType: "image", extension: "jpg" })
    expect(classifyMedia({ type: "video/quicktime", size: MEDIA_MAX_BYTES.image + 1 })).toEqual({ mediaType: "video", extension: "mov" })
  })

  it("refuses what is too large, in words", () => {
    expect(classifyMedia({ type: "image/png", size: MEDIA_MAX_BYTES.image + 1 })).toEqual({ error: expect.stringContaining("10 MB") })
    expect(classifyMedia({ type: "video/mp4", size: MEDIA_MAX_BYTES.video + 1 })).toEqual({ error: expect.stringContaining("100 MB") })
  })

  it("refuses SVG and everything that is not a picture or a video", () => {
    for (const type of ["image/svg+xml", "application/pdf", "text/html", ""])
      expect(classifyMedia({ type, size: 10 })).toHaveProperty("error")
  })
})

describe("media paths", () => {
  it("round-trips, and names the whiteboard whose readers read the file", () => {
    const path = mediaPath(home, fileId, "webm")
    expect(parseMediaPath(path)).toBe(path)
    expect(mediaDocumentId(path)).toBe(home.documentId)
    expect(mediaTypeOf(path)).toBe("video")
    expect(mediaTypeOf(mediaPath(home, fileId, "avif"))).toBe("image")
  })

  it("takes nothing that could point anywhere else", () => {
    const path = mediaPath(home, fileId, "png")
    for (const hostile of [null, 7, "", `/${path}`, `${path}/`, path.replace(".png", ".svg"), path.toUpperCase(), `a/../${path}`])
      expect(parseMediaPath(hostile)).toBeNull()
  })
})

describe("fitMedia", () => {
  it("keeps the proportions and caps the size on the canvas", () => {
    expect(fitMedia({ width: 3840, height: 2160 })).toEqual({ width: 480, height: 270 })
    expect(fitMedia({ width: 1000, height: 3000 })).toEqual({ width: 120, height: 360 })
  })

  it("never enlarges a small picture, and never makes one too small to hold", () => {
    expect(fitMedia({ width: 200, height: 100 })).toEqual({ width: 200, height: 100 })
    expect(fitMedia({ width: 16, height: 16 })).toEqual({ width: 48, height: 48 })
  })
})

describe("layoutMedia", () => {
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

  it("centers one file on the point", () => {
    expect(layoutMedia([{ width: 400, height: 200 }], { x: 1000, y: 500 })).toEqual([{ x: 800, y: 400 }])
  })

  it("lays out many without any two overlapping, in rows", () => {
    const sizes = Array.from({ length: 9 }, (_, i) => ({ width: 200 + i * 40, height: 120 + (i % 3) * 90 }))
    const boxes = layoutMedia(sizes, { x: 0, y: 0 }).map((place, i) => ({ ...place, ...sizes[i] }))
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(overlap(a, b)).toBe(false)
    expect(new Set(boxes.map((box) => box.y)).size).toBeGreaterThan(1)
  })
})

describe("formatBytes", () => {
  it("says a size in the units the per-file limits use", () => {
    expect(formatBytes(0)).toBe("0 bytes")
    expect(formatBytes(1)).toBe("1 byte")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(MEDIA_MAX_BYTES.image)).toBe("10 MB")
    expect(formatBytes(1024 ** 3)).toBe("1 GB")
    expect(formatBytes(2.25 * 1024 ** 3)).toBe("2.3 GB")
  })

  it("never says 1024 of a unit", () => {
    expect(formatBytes(1024 * 1024 - 100)).toBe("1 MB")
  })
})

describe("storageFullMessage", () => {
  // The messages raised by private.enforce_media_storage_limit().
  const free =
    "The free plan includes 1 GB of storage for pictures and videos, and this file does not fit in what is left. Upgrading raises it."
  const paid = "This file does not fit in what is left of this org's 50 GB of storage for pictures and videos."

  it("passes on the database's refusal, and says where to look", () => {
    expect(storageFullMessage(free)).toBe(`${free} Settings, under General, shows how much it keeps.`)
    expect(storageFullMessage(paid)).toBe(`${paid} Settings, under General, shows how much it keeps.`)
  })

  it("is null for any other refusal", () => {
    expect(storageFullMessage("new row violates row-level security policy")).toBeNull()
    expect(storageFullMessage(undefined)).toBeNull()
  })
})
