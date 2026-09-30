import { describe, expect, it } from "vitest"

import { resolveRelative } from "@/lib/import/paths"

import {
  claimName,
  layoutExport,
  layoutInView,
  relativeHref,
  safeName,
  type ExportDocumentRow,
  type ExportFolderRow,
} from "./layout"

const folder = (id: string, name: string, parent: string | null = null, position = 0): ExportFolderRow => ({
  id,
  name,
  parent_folder_id: parent,
  position,
})
const document = (
  id: string,
  title: string,
  where: { folder?: string; parent?: string } = {},
  extra: Partial<ExportDocumentRow> = {}
): ExportDocumentRow => ({
  id,
  title,
  type: "text",
  kind: "standard",
  folder_id: where.folder ?? null,
  parent_document_id: where.parent ?? null,
  position: 0,
  ...extra,
})

const pathsOf = (layout: ReturnType<typeof layoutExport>) =>
  Object.fromEntries([...layout.folders, ...layout.documents].map((item) => [item.id, item.path]))

describe("file names", () => {
  it("keeps a title readable and makes it safe on every file system", () => {
    expect(safeName("Payments / refunds: Q3")).toBe("Payments - refunds Q3")
    expect(safeName("Standup 10:30")).toBe("Standup 10-30")
    expect(safeName('What is "done"?')).toBe("What is done")
    expect(safeName(".env notes")).toBe("env notes")
    expect(safeName("Ends with a dot. ")).toBe("Ends with a dot")
    expect(safeName("  \n ")).toBe("Untitled")
    expect(safeName("CON")).toBe("_CON")
    expect(safeName("Café 🚀 ideas")).toBe("Café 🚀 ideas")
  })

  it("cuts a long title to fit a file name, whole characters only", () => {
    const name = safeName("é".repeat(200))
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(120)
    expect(name).toBe("é".repeat(60))
  })

  it("numbers names that are taken, ignoring case", () => {
    const taken = new Set<string>()
    expect(claimName(taken, "Notes", ["", ".md"])).toBe("Notes")
    expect(claimName(taken, "notes", ["", ".md"])).toBe("notes 2")
    // A picture called "Notes.md" would be the page's file.
    expect(claimName(taken, "Notes", [".md"])).toBe("Notes 3")
  })
})

describe("the layout of a project's export", () => {
  it("puts folders as folders, pages as .md, whiteboards as .svg and .json, and what a document holds in a folder of its name", () => {
    const layout = layoutExport(
      [folder("f1", "Guides"), folder("f2", "Setup", "f1")],
      [
        document("d1", "Welcome"),
        document("d2", "Install", { folder: "f2" }),
        document("w1", "Architecture", {}, { type: "whiteboard", position: 1 }),
        document("d3", "Payments", { parent: "w1" }),
        document("w2", "Payments flow", { parent: "w1" }, { type: "whiteboard" }),
      ]
    )
    expect(pathsOf(layout)).toEqual({
      f1: "Guides",
      f2: "Guides/Setup",
      d1: "Welcome",
      d2: "Guides/Setup/Install",
      w1: "Architecture",
      d3: "Architecture/Payments",
      w2: "Architecture/Payments flow",
    })
    expect(layout.documents.find((item) => item.id === "w1")!.files).toEqual(["Architecture.svg", "Architecture.json"])
    expect(layout.documents.find((item) => item.id === "d2")!.files).toEqual(["Guides/Setup/Install.md"])
  })

  it("gives documents and folders with one name a name each, and keeps the top's own files free", () => {
    const layout = layoutExport(
      [folder("f1", "Notes")],
      [
        document("d1", "Notes", {}, { position: 1 }),
        document("d2", "Notes", {}, { position: 2 }),
        document("w1", "subcanvas-export", {}, { type: "whiteboard" }),
      ]
    )
    // The folder keeps its name; the page's own folder would have been it.
    expect(pathsOf(layout)).toMatchObject({ f1: "Notes", d1: "Notes 2", d2: "Notes 3", w1: "subcanvas-export 2" })
  })

  it("puts a box's description after the documents the tree shows, in its whiteboard's folder", () => {
    const layout = layoutExport(
      [],
      [
        document("w1", "Board", {}, { type: "whiteboard" }),
        document("x1", "API", { parent: "w1" }, { kind: "description" }),
        document("d1", "API", { parent: "w1" }, { position: 5 }),
      ]
    )
    expect(pathsOf(layout)).toMatchObject({ d1: "Board/API", x1: "Board/API 2" })
    expect(layout.documents.find((item) => item.id === "x1")!.kind).toBe("description")
  })

  it("leaves out what has no place: inside a trashed document or a folder that is not there", () => {
    const layout = layoutExport(
      [],
      [document("d1", "Kept"), document("d2", "Inside the trash", { parent: "trashed" }), document("d3", "Lost", { folder: "gone" })]
    )
    expect(layout.documents.map((item) => item.id)).toEqual(["d1"])
  })
})

describe("links between files", () => {
  it("writes a relative address that Import files resolves back to the file", () => {
    const cases: [string, string][] = [
      ["Guides/Setup/Install.md", "Welcome.md"],
      ["Welcome.md", "Guides/Setup (old)/Install #2.md"],
      ["Architecture/Payments.md", "Architecture/Payments/shot.png"],
      ["Guides/Café.md", "Guides/Café/100% done.png"],
    ]
    for (const [from, to] of cases) {
      const href = relativeHref(from, to)
      expect(href).not.toMatch(/[\s()#]/)
      expect(resolveRelative(from, href)).toBe(to)
    }
    expect(relativeHref("Guides/Setup/Install.md", "Welcome.md")).toBe("../../Welcome.md")
    expect(relativeHref("Welcome.md", "Guides/My page.md")).toBe("Guides/My%20page.md")
  })
})

describe("what is in the trash", () => {
  const TRASHED = "2026-09-30T00:00:00Z"
  const live = <T extends object>(row: T, deleted_at: string | null = null) => ({ ...row, deleted_at })

  it("leaves out a trashed folder and everything inside it, however deep", () => {
    const layout = layoutInView(
      [live(folder("plans", "Plans"), TRASHED), live(folder("inner", "Inner", "plans")), live(folder("kept", "Kept"))],
      [
        live(document("road", "Roadmap", { folder: "plans" })),
        live(document("deep", "Deep", { parent: "road" })),
        live(document("notes", "Notes", { folder: "inner" })),
        live(document("top", "Overview")),
        live(document("filed", "Filed", { folder: "kept" })),
      ]
    )
    expect(pathsOf(layout)).toEqual({ kept: "Kept", filed: "Kept/Filed", top: "Overview" })
  })

  it("leaves out a trashed document and what is nested in it, and keeps its folder", () => {
    const layout = layoutInView(
      [live(folder("kept", "Kept"))],
      [
        live(document("board", "Board", { folder: "kept" }, { type: "whiteboard" }), TRASHED),
        live(document("inside", "Inside", { parent: "board" })),
        live(document("other", "Other")),
      ]
    )
    expect(pathsOf(layout)).toEqual({ kept: "Kept", other: "Other" })
  })
})
