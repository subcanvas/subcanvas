import { describe, expect, it } from "vitest"
import * as Y from "yjs"

import { collect } from "@/lib/import/collect"
import { planImport } from "@/lib/import/plan"
import { listZip, readZipEntry } from "@/lib/import/zip"
import { applyBlockEdit } from "@/lib/text/blocks"
import { edgesMap, nodesMap, toYMap } from "@/lib/whiteboard/schema"

import { layoutExport } from "./layout"
import { exportMarkdown, readTextBlocks, type LinkedDocument } from "./markdown"
import type { ExportedDocument } from "./read"
import { readWhiteboard } from "./whiteboard"
import { buildProjectZip, type ExportSource } from "./zip"

// A project exported through a stand-in for the server and Storage, then
// read back with the importer's own zip reader, which is what a person
// bringing the zip back into Subcanvas goes through.

const ORIGIN = "https://app.test"
const ORG = "11111111-1111-4111-8111-111111111111"
const PROJECT = "22222222-2222-4222-8222-222222222222"
const SETUP = "33333333-3333-4333-8333-333333333333"
const BOARD = "44444444-4444-4444-8444-444444444444"
const API = "55555555-5555-4555-8555-555555555555"
const BROKEN = "66666666-6666-4666-8666-666666666666"
const MAP = `${ORG}/${PROJECT}/${SETUP}/77777777-7777-4777-8777-777777777777.png`
const LOST = `${ORG}/${PROJECT}/${SETUP}/88888888-8888-4888-8888-888888888888.png`
const PHOTO = `${ORG}/${PROJECT}/${BOARD}/99999999-9999-4999-8999-999999999999.jpg`
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

const text = (value: string) => ({ type: "text", text: value, styles: {} })
const pageOf = (id: string) => `${ORIGIN}/acme/${PROJECT}/d/${id}`

async function setupPage(): Promise<ExportedDocument> {
  const doc = new Y.Doc()
  applyBlockEdit(doc, {
    kind: "append",
    blocks: [
      { type: "paragraph", content: [text("See "), { type: "link", href: `/acme/${PROJECT}/d/${BOARD}`, content: [text("the board")] }] },
      { type: "image", props: { url: `/api/media/${MAP}`, name: "map.png", caption: "The service map" } },
      { type: "image", props: { url: `/api/media/${LOST}`, name: "lost.png", caption: "" } },
      { type: "documentLink", props: { docId: API } },
    ] as never,
  })
  const documents = new Map<string, LinkedDocument>([
    [BOARD, { title: "Board", url: pageOf(BOARD) }],
    [API, { title: "API", url: pageOf(API) }],
  ])
  const exported = await exportMarkdown(readTextBlocks(doc), { title: "Setup", origin: ORIGIN, documents })
  return { id: SETUP, type: "text", title: "Setup", ...exported }
}

function board(): ExportedDocument {
  const doc = new Y.Doc()
  nodesMap(doc).set("group", toYMap({ kind: "group", x: 0, y: 0, width: 400, height: 300, title: "Backend" }))
  nodesMap(doc).set("api", toYMap({ kind: "plain", x: 20, y: 40, parentId: "group", title: "API", docId: API, docType: "text", shape: "cylinder" }))
  nodesMap(doc).set("photo", toYMap({ kind: "media", x: 500, y: 0, title: "Photo", mediaPath: PHOTO, mediaWidth: 640, mediaHeight: 480, alt: "The team" }))
  edgesMap(doc).set("e1", toYMap({ source: "api", target: "photo", label: "shows", direction: "forward" }))
  const contents = readWhiteboard(doc)
  return {
    id: BOARD,
    type: "whiteboard",
    title: "Board",
    svg: "<svg>Board</svg>",
    ...contents,
    media: [{ path: PHOTO, url: `${ORIGIN}/api/media/${PHOTO}`, name: "Photo" }],
    links: { [API]: { title: "API", url: pageOf(API) } },
  }
}

function source(): ExportSource {
  const layout = layoutExport(
    [{ id: "f1", name: "Guides", parent_folder_id: null, position: 0 }, { id: "f2", name: "Empty", parent_folder_id: null, position: 1 }],
    [
      { id: SETUP, title: "Setup", type: "text", kind: "standard", folder_id: "f1", parent_document_id: null, position: 0 },
      { id: BOARD, title: "Board", type: "whiteboard", kind: "standard", folder_id: null, parent_document_id: null, position: 1 },
      { id: API, title: "API", type: "text", kind: "description", folder_id: null, parent_document_id: BOARD, position: 0 },
      { id: BROKEN, title: "Broken", type: "text", kind: "standard", folder_id: null, parent_document_id: null, position: 2 },
    ]
  )
  return {
    project: async () => ({ project: { id: PROJECT, name: "Launch: plan" }, layout }),
    documents: async function* (ids) {
      const all: Record<string, () => Promise<ExportedDocument> | ExportedDocument> = {
        [SETUP]: setupPage,
        [BOARD]: board,
        [API]: async () => ({ id: API, type: "text", title: "API", markdown: "# API\n\nThe public API.\n", media: [], links: {} }),
        [BROKEN]: () => ({ id: BROKEN, error: "This document could not be read." }),
      }
      for (const id of ids) yield await all[id]()
    },
    // The one file Storage does not have is refused.
    sign: async (paths) => new Map(paths.map((path) => [path, path === LOST ? null : `blob:${path}`])),
    download: async () => new Blob([PNG]),
  }
}

async function exported() {
  const progress: number[] = []
  const zip = await buildProjectZip({
    source: source(),
    origin: ORIGIN,
    exportedAt: new Date("2026-09-30T07:01:00Z"),
    onProgress: (step) => progress.push(step.documents),
  })
  const entries = await listZip(zip.blob)
  const read = async (name: string) => {
    const entry = entries.find((item) => item.name === name)
    if (!entry) throw new Error(`${name} is not in the zip`)
    return (await readZipEntry(zip.blob, entry, 10_000_000))!
  }
  const textOf = async (name: string) => new TextDecoder().decode(await read(name))
  return { zip, entries, read, textOf, progress }
}

describe("a project's export", () => {
  it("lays the project out as folders and files, with the project's name on the zip", async () => {
    const { zip, entries, progress } = await exported()
    expect(zip.fileName).toBe("Launch plan.zip")
    expect(entries.map((entry) => entry.name).sort()).toEqual(
      [
        "Board.json",
        "Board.svg",
        "Board/API.md",
        "Board/Photo.jpg",
        "Empty/",
        "Guides/",
        "Guides/Setup.md",
        "Guides/Setup/The service map.png",
        "README.txt",
        "subcanvas-export.json",
      ].sort()
    )
    expect(zip).toMatchObject({ documents: 3, files: 2 })
    expect(progress.at(-1)).toBe(4)
  })

  it("points links and pictures at their files, and leaves what is not in the zip at its address", async () => {
    const { textOf } = await exported()
    const setup = await textOf("Guides/Setup.md")
    expect(setup).toContain("# Setup")
    expect(setup).toContain("[the board](../Board.svg)")
    expect(setup).toContain("![The service map](Setup/The%20service%20map.png)")
    expect(setup).toContain("\n[API](../Board/API.md)\n")
    // Storage did not have this one, so it keeps the address it has in the app.
    expect(setup).toContain(`![lost.png](${ORIGIN}/api/media/${LOST})`)
  })

  it("keeps pictures and videos as they are", async () => {
    const { read } = await exported()
    expect(await read("Guides/Setup/The service map.png")).toEqual(PNG)
  })

  it("writes each whiteboard's contents as JSON: boxes, groups, arrows, and what each holds", async () => {
    const { textOf } = await exported()
    expect(await textOf("Board.svg")).toBe("<svg>Board</svg>")
    const contents = JSON.parse(await textOf("Board.json"))
    expect(contents).toMatchObject({ format: "subcanvas-whiteboard", version: 1, id: BOARD, title: "Board" })
    const node = (id: string) => contents.nodes.find((item: { id: string }) => item.id === id)
    expect(node("api")).toMatchObject({
      kind: "plain",
      title: "API",
      group: "group",
      shape: "cylinder",
      holds: { id: API, type: "text", title: "API", path: "Board/API.md", url: pageOf(API) },
    })
    expect(node("group")).toMatchObject({ kind: "group", title: "Backend", holds: null })
    expect(node("photo").media).toEqual({
      type: "image",
      width: 640,
      height: 480,
      alt: "The team",
      path: "Board/Photo.jpg",
      url: `${ORIGIN}/api/media/${PHOTO}`,
    })
    expect(contents.edges).toEqual([expect.objectContaining({ id: "e1", source: "api", target: "photo", label: "shows" })])
  })

  it("says in README.txt and the manifest what it holds and what was left out", async () => {
    const { textOf } = await exported()
    const readme = await textOf("README.txt")
    expect(readme).toMatch(/^Launch: plan\n\nExported from app\.test on 2026-09-30 07:01 UTC/)
    expect(readme).toContain(`Guides/Setup/lost.png: could not be fetched from storage`)
    expect(readme).toContain("Broken.md: This document could not be read.")

    const manifest = JSON.parse(await textOf("subcanvas-export.json"))
    expect(manifest).toMatchObject({ format: "subcanvas-export", version: 1, project: { id: PROJECT, name: "Launch: plan" } })
    expect(manifest.documents.map((document: { path: string }) => document.path)).toEqual(["Guides/Setup", "Board", "Board/API", "Broken"])
    expect(manifest.left_out).toHaveLength(2)
  })

  it("asks again for what an answer did not carry, and leaves out only a document that cannot be sent", async () => {
    const base = source()
    let requests = 0
    const zip = await buildProjectZip({
      source: {
        ...base,
        // Each answer carries one document, as a server at its size budget
        // does, and the whiteboard's answer always fails.
        documents: async function* (ids) {
          requests++
          if (ids[0] === BOARD) throw new Error("413")
          for await (const document of base.documents(ids.slice(0, 1))) yield document
        },
      },
      origin: ORIGIN,
    })
    const names = (await listZip(zip.blob)).map((entry) => entry.name)
    expect(names).toContain("Guides/Setup.md")
    expect(names).toContain("Board/API.md")
    expect(names).not.toContain("Board.json")
    expect(zip.leftOut).toContainEqual({ path: "Board.json", reason: "the server could not send it" })
    expect(requests).toBeGreaterThan(4)
  })

  it("comes back through Import files as its pages, with their pictures, and without its whiteboards or README", async () => {
    const { zip } = await exported()
    const collected = await collect([{ path: "Launch plan.zip", file: zip.blob }])
    const plan = planImport(collected.files, {
      intoDocument: false,
      attachments: [...collected.skipped.map((file) => file.path), ...collected.media.keys()],
      newId: (() => {
        let next = 0
        return () => `id-${++next}`
      })(),
      hrefFor: (id) => `/d/${id}`,
      media: { orgId: ORG, projectId: PROJECT, has: (path) => collected.media.has(path) },
    })

    expect(plan.documents.map((document) => document.title).sort()).toEqual(["API", "Setup"])
    expect(collected.skipped).toEqual([
      { path: "Board.svg", reason: "whiteboard" },
      { path: "Board.json", reason: "whiteboard" },
    ])
    // The page's picture is uploaded again, and its link to the other page
    // points at the document that page becomes.
    expect(plan.uploads.map((upload) => upload.source)).toEqual(["Guides/Setup/The service map.png"])
    const setup = plan.documents.find((document) => document.title === "Setup")!
    const api = plan.documents.find((document) => document.title === "API")!
    expect(setup.markdown).toContain(`[API](/d/${api.id})`)
    expect(setup.markdown).toMatch(/!\[The service map\]\(\/api\/media\/[^)]+\.png\)/)
    // A box's page comes back in a folder named after its whiteboard.
    expect(plan.folders.map((folder) => folder.name).sort()).toEqual(["Board", "Guides"])
  })
})
