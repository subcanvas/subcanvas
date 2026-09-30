import { afterEach, describe, expect, it, vi } from "vitest"

import { listFolderMedia, listMedia, MEDIA_PAGE_ROWS, removeMedia, type MediaObject } from "./media-cleanup"

// A stand-in for PostgREST: it hands back at most `maxRows` rows a request,
// whatever range was asked for, as the real server does with max_rows.
function server(rows: MediaObject[], maxRows: number, failAt?: number) {
  const ranges: [number, number][] = []
  const calls: { fn: string; args: unknown; order: string[] }[] = []
  const rpc = (fn: string, args: unknown) => {
    const call = { fn, args, order: [] as string[] }
    calls.push(call)
    const builder = {
      order(column: string) {
        call.order.push(column)
        return builder
      },
      range(from: number, to: number) {
        ranges.push([from, to])
        if (from === failAt) return Promise.resolve({ data: null, error: { message: "boom" } })
        return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + maxRows)), error: null })
      },
    }
    return builder
  }
  return { client: { rpc } as never, ranges, calls }
}

const files = (count: number): MediaObject[] =>
  Array.from({ length: count }, (_, index) => ({
    bucket_id: index % 2 ? "media-videos" : "media-images",
    name: `org/project/document/${String(index).padStart(5, "0")}.png`,
  }))

afterEach(() => vi.restoreAllMocks())

describe("listMedia", () => {
  it("reads past the server's 1,000-row cap, a page at a time, until a page is empty", async () => {
    const all = files(2500)
    const { client, ranges, calls } = server(all, 1000)
    expect(await listMedia(client, "org", "document")).toEqual(all)
    expect(ranges).toEqual([
      [0, MEDIA_PAGE_ROWS - 1],
      [1000, 1000 + MEDIA_PAGE_ROWS - 1],
      [2000, 2000 + MEDIA_PAGE_ROWS - 1],
      [2500, 2500 + MEDIA_PAGE_ROWS - 1],
    ])
    // In a fixed order, so that pages neither overlap nor skip.
    expect(calls.every((call) => call.fn === "media_objects" && call.order.join() === "bucket_id,name")).toBe(true)
    expect(calls[0].args).toEqual({ p_org_id: "org", p_document_id: "document" })
  })

  it("gets every row from a server whose cap is lower than a page", async () => {
    const all = files(1234)
    const { client, ranges } = server(all, 500)
    expect(await listMedia(client, "org")).toEqual(all)
    expect(ranges.map(([from]) => from)).toEqual([0, 500, 1000, 1234])
  })

  it("asks once when there is nothing", async () => {
    const { client, ranges } = server([], 1000)
    expect(await listMedia(client, "org")).toEqual([])
    expect(ranges).toHaveLength(1)
  })

  it("keeps what it read when a page fails, and says so", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const all = files(1500)
    const { client } = server(all, 1000, 1000)
    expect(await listMedia(client, "org")).toEqual(all.slice(0, 1000))
    expect(error).toHaveBeenCalled()
  })
})

describe("listFolderMedia", () => {
  it("pages through a folder's files too", async () => {
    const all = files(3001)
    const { client, calls } = server(all, 1000)
    expect(await listFolderMedia(client, "folder")).toEqual(all)
    expect(calls[0]).toMatchObject({ fn: "folder_media_objects", args: { p_folder_id: "folder" } })
  })
})

describe("removeMedia", () => {
  function storage(refuse?: (bucket: string, names: string[]) => string | null) {
    const removed: { bucket: string; names: string[] }[] = []
    const client = {
      storage: {
        from: (bucket: string) => ({
          remove: async (names: string[]) => {
            removed.push({ bucket, names })
            const message = refuse?.(bucket, names)
            return message ? { data: null, error: { message } } : { data: names.map((name) => ({ name })), error: null }
          },
        }),
      },
    } as never
    return { client, removed }
  }

  it("removes every file, in batches of 100 for each bucket, each name once", async () => {
    const all = files(450)
    const { client, removed } = storage()
    await removeMedia(client, [...all, ...all.slice(0, 10)])
    expect(removed.every(({ names }) => names.length <= 100)).toBe(true)
    const names = removed.flatMap(({ bucket, names }) => names.map((name) => `${bucket}/${name}`))
    expect(names.sort()).toEqual(all.map((file) => `${file.bucket_id}/${file.name}`).sort())
  })

  it("tries every batch, then throws with what Storage said", async () => {
    const { client, removed } = storage((bucket) => (bucket === "media-images" ? "Storage is down" : null))
    await expect(removeMedia(client, files(300))).rejects.toThrow(/Storage is down/)
    expect(removed.filter(({ bucket }) => bucket === "media-videos").flatMap(({ names }) => names)).toHaveLength(150)
  })

  it("does nothing, and does not throw, with nothing to remove", async () => {
    const { client, removed } = storage()
    await expect(removeMedia(client, [])).resolves.toBeUndefined()
    expect(removed).toEqual([])
  })
})
