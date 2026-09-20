import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { fixtureFiles, picked, zipOf } from "./__fixtures__/load"
import { makeBatches } from "./batches"
import { collect, CollectError } from "./collect"
import { csvToMarkdown, parseCsv } from "./csv"
import { MAX_BATCH_BYTES, MAX_BATCH_DOCUMENTS, MAX_DOCUMENTS, MAX_FILE_BYTES, MAX_ZIP_ENTRIES } from "./limits"
import { rewriteLinks } from "./links"
import { cleanName, readMarkdownFile } from "./markdown-file"
import { isClutter, kindOf, resolveRelative, safePath } from "./paths"
import { pickedFromDrop } from "./picked"
import { planImport, tooManyDocuments, type ImportPlan, type SourceFile } from "./plan"
import { listZip, readZipEntry } from "./zip"

// Ids that read well in a failure: doc-1, doc-2, in the order they are made.
function plan(files: SourceFile[], intoDocument = false) {
  let next = 0
  return planImport(files, { intoDocument, newId: () => `id-${++next}`, hrefFor: (id) => `/d/${id}` })
}

async function planFixture(sample: Parameters<typeof fixtureFiles>[0]) {
  const collected = await collect([{ path: `${sample}.zip`, file: zipOf(fixtureFiles(sample)) }])
  return { ...collected, plan: plan(collected.files) }
}

const titled = (result: ImportPlan, title: string) => result.documents.find((document) => document.title === title)!
const parentTitle = (result: ImportPlan, title: string) => {
  const parent = titled(result, title).parent
  if (parent.kind === "target") return "(target)"
  return parent.kind === "folder"
    ? `folder ${result.folders.find((folder) => folder.id === parent.id)!.name}`
    : `document ${result.documents.find((document) => document.id === parent.id)!.title}`
}

describe("titles and front matter", () => {
  it("takes the title from the opening heading and leaves it out of the body", () => {
    expect(readMarkdownFile("a/note.md", "# The **real** title #\n\nBody")).toEqual({ title: "The real title", body: "Body" })
    expect(readMarkdownFile("note.md", "Title\n=====\n\nBody")).toEqual({ title: "Title", body: "Body" })
  })

  it("falls back to front matter, then to the file name, and never keeps front matter", () => {
    expect(readMarkdownFile("x.md", '---\ntitle: "From YAML"\ntags: [a]\n---\nBody')).toEqual({ title: "From YAML", body: "Body" })
    expect(readMarkdownFile("folder/My note.md", "---\ntags: [a]\n---\nBody\n\n# Later heading")).toEqual({
      title: "My note",
      body: "Body\n\n# Later heading",
    })
  })

  it("prefers the heading to front matter", () => {
    expect(readMarkdownFile("x.md", "---\ntitle: YAML\n---\n\n# Heading\n").title).toBe("Heading")
  })

  it("reads past a byte-order mark and CRLF line endings", () => {
    expect(readMarkdownFile("x.md", "\uFEFF---\r\ntitle: Windows\r\n---\r\nBody\r\nmore")).toEqual({
      title: "Windows",
      body: "Body\nmore",
    })
    expect(readMarkdownFile("x.md", "\uFEFF# Heading\r\n\r\nBody").title).toBe("Heading")
  })

  it("does not mistake a rule that opens a note for front matter", () => {
    expect(readMarkdownFile("x.md", "---\n\nAfter a rule").body).toBe("---\n\nAfter a rule")
  })

  it("strips Notion's id from names", () => {
    expect(cleanName("Page Title 0123456789abcdef0123456789abcdef")).toBe("Page Title")
    expect(cleanName("Tasks 0123456789abcdef0123456789abcdef_all")).toBe("Tasks_all")
    expect(cleanName("Release 2026 notes")).toBe("Release 2026 notes")
    expect(readMarkdownFile("Roadmap 0123456789abcdef0123456789abcdef.md", "No heading").title).toBe("Roadmap")
  })
})

describe("paths", () => {
  it("refuses paths that leave the import", () => {
    expect(safePath("../../etc/passwd")).toBeNull()
    expect(safePath("a/../../b.md")).toBeNull()
    expect(safePath("/etc/passwd")).toBeNull()
    expect(safePath("C:\\Users\\x.md")).toBeNull()
    expect(safePath("..\\x.md")).toBeNull()
    expect(safePath("a\0.md")).toBeNull()
    expect(safePath("./a//b\\c.md")).toBe("a/b/c.md")
  })

  it("knows clutter and kinds", () => {
    expect(["__MACOSX/a.md", ".obsidian/app.json", "a/.DS_Store", "node_modules/x/README.md"].map(isClutter)).toEqual([true, true, true, true])
    expect(isClutter("notes/a.b.md")).toBe(false)
    expect(["a.MD", "a.markdown", "a.txt", "a.csv", "a.PNG", "a.pdf"].map(kindOf)).toEqual(["markdown", "markdown", "markdown", "csv", "image", "other"])
  })

  it("resolves relative, URL-encoded links", () => {
    expect(resolveRelative("a/b/c.md", "../d%20e.md")).toBe("a/d e.md")
    expect(resolveRelative("a.md", "./b/c.md")).toBe("b/c.md")
    expect(resolveRelative("a.md", "../outside.md")).toBeNull()
    expect(resolveRelative("a.md", "100%.md")).toBe("100%.md")
  })
})

describe("csv", () => {
  it("parses quotes, commas, and line breaks inside fields", () => {
    expect(parseCsv('a,b\r\n"1,5","say ""hi""\nthere"\n')).toEqual([["a", "b"], ["1,5", 'say "hi"\nthere']])
  })

  it("makes a table, and refuses one too large to be a page", () => {
    expect(csvToMarkdown("Name,Note\nAda,a | b\n")).toBe("| Name | Note |\n| --- | --- |\n| Ada | a \\| b |\n")
    expect(csvToMarkdown("n\n" + "row\n".repeat(201))).toBeNull()
    expect(csvToMarkdown("")).toBeNull()
  })
})

describe("link rewriting", () => {
  const targets = {
    byPath: (path: string) => (path === "notes/other.md" ? "/d/other" : null),
    byName: (name: string) => (name === "Other" ? "/d/other" : null),
    fileNamed: () => null,
  }
  const rewrite = (markdown: string) => rewriteLinks(markdown, "notes/this.md", targets)

  it("points Markdown links at documents and unlinks what was not imported", () => {
    expect(rewrite("[a](./other.md) [b](other.md#part) [c](<other.md> \"t\") [d](missing.pdf) [e](https://x.y/z.md)")).toEqual({
      markdown: "[a](/d/other) [b](/d/other) [c](/d/other) d [e](https://x.y/z.md)",
      localImages: 0,
      unlinked: 1,
    })
  })

  it("rewrites wiki links, aliases, and embeds, and leaves unknown ones as written", () => {
    expect(rewrite("[[Other]] [[Other|alias]] [[Other#Heading]] ![[Other]] [[Missing]]").markdown).toBe(
      "[Other](/d/other) [alias](/d/other) [Other#Heading](/d/other) [Other](/d/other) [[Missing]]"
    )
  })

  it("keeps remote images, and counts local ones, leaving their alt text", () => {
    expect(rewrite("![remote](https://x.y/a.png) ![A chart](img/chart.png) ![](img/pic.png) ![[shot.png|300]] ![x](data:image/png;base64,AAAA)")).toEqual({
      markdown: "![remote](https://x.y/a.png) A chart pic shot x",
      localImages: 4,
      unlinked: 0,
    })
  })

  it("leaves code alone", () => {
    const code = "`[[Other]]` and\n\n```md\n[[Other]] [a](other.md)\n```\n\n~~~\n![x](y.png)\n~~~"
    expect(rewrite(code)).toEqual({ markdown: code, localImages: 0, unlinked: 0 })
  })

  it("rewrites reference definitions, callouts, and highlights", () => {
    expect(rewrite("See [ref], [the text][REF], [out][] and ![pic][img]. Not [this] or [^1].\n\n[ref]: other.md\n[out]: <https://x.y> \"Title\"\n[img]: https://x.y/a.png\n[^1]: A footnote.").markdown).toBe(
      "See [ref](/d/other), [the text](/d/other), [out](https://x.y) and ![pic](https://x.y/a.png). Not [this] or [^1].\n\n[^1]: A footnote."
    )
    expect(rewrite("> [!warning]- Careful now\n> body\n\n> [!note]\n> body").markdown).toBe("> **Careful now**\n> body\n\n> **Note**\n> body")
    expect(rewrite("==bright== but a == b == c").markdown).toBe("bright but a == b == c")
  })
})

describe("planning a Notion export", () => {
  it("nests subpages under their page, names things without ids, and keeps databases small enough to read", async () => {
    const { plan: result, skipped } = await planFixture("notion")
    expect(result.folders).toEqual([])
    expect(result.documents.map((document) => [document.title, parentTitle(result, document.title)])).toEqual([
      ["Team Wiki", "(target)"],
      ["Onboarding", "document Team Wiki"],
      ["Laptop setup", "document Onboarding"],
      ["Tasks", "document Team Wiki"],
      ["Write the handbook", "document Tasks"],
    ])
    expect(titled(result, "Tasks").markdown).toContain('| Order laptops | Done | Grace | Ask about the "pro" model \\| urgent |')
    expect(skipped).toEqual([{ path: "Team Wiki 1f0c2a9b7d3e4f5a8b6c9d0e1f2a3b4c/office-map.png", reason: "image" }])
  })

  it("follows Notion's URL-encoded links, up and down", async () => {
    const { plan: result } = await planFixture("notion")
    const wiki = titled(result, "Team Wiki")
    expect(wiki.markdown).toContain(`[Onboarding](/d/${titled(result, "Onboarding").id})`)
    expect(wiki.markdown).toContain(`[Tasks](/d/${titled(result, "Tasks").id})`)
    expect(wiki.markdown).toContain("\nOffice map\n")
    expect(titled(result, "Onboarding").markdown).toContain(`[Team Wiki](/d/${wiki.id})`)
    expect(titled(result, "Onboarding").markdown).toContain(`[Laptop setup](/d/${titled(result, "Laptop setup").id})`)
    expect(result.localImages).toBe(1)
  })
})

describe("planning an Obsidian vault", () => {
  it("mirrors folders, skips the settings folder, and resolves wiki links by name", async () => {
    const { plan: result, skipped } = await planFixture("obsidian")
    expect(result.folders.map((folder) => folder.name)).toEqual(["Daily", "Projects"])
    expect(parentTitle(result, "Apollo")).toBe("folder Projects")
    expect(skipped).toEqual([{ path: "attachments/diagram.png", reason: "image" }])

    const home = titled(result, "Vault home").markdown
    const apollo = titled(result, "Apollo").id
    const glossary = titled(result, "Glossary").id
    expect(home).toContain(`[the Apollo project](/d/${apollo})`)
    expect(home).toContain(`read [Glossary](/d/${glossary}).`)
    expect(home).toContain(`\n[Glossary](/d/${glossary})\n`)
    expect(home).toContain(`[2026-09-20](/d/${titled(result, "2026-09-20").id})`)
    expect(home).toContain("[[Nowhere]]")
    expect(home).toContain("> **Mind the gap**")
    expect(home).toContain("\ndiagram\n")
    expect(home).not.toContain("tags:")
    expect(titled(result, "2026-09-20").markdown).toBe(`- Worked on [Apollo](/d/${apollo})\n- Read [the glossary](/d/${glossary})\n`)
    expect(titled(result, "Glossary").markdown).toContain("`[[Apollo]]`")
    expect(titled(result, "Glossary").markdown).toContain("[[Apollo]] stays as written.")
  })
})

describe("planning a folder of docs", () => {
  it("handles a BOM, CRLF, setext titles, reference links, and files that are not notes", async () => {
    const collected = await collect(picked(fixtureFiles("docs")))
    const result = plan(collected.files)
    expect(result.documents.map((document) => [document.title, parentTitle(result, document.title)])).toEqual([
      ["Frequently asked questions", "folder guides"],
      ["Handbook", "(target)"],
      ["Install", "folder guides"],
      ["notes", "(target)"],
    ])
    const readme = titled(result, "Handbook").markdown
    expect(readme).not.toContain("\r")
    expect(readme).toContain(`[install guide](/d/${titled(result, "Install").id})`)
    expect(readme).toContain(`[the FAQ](/d/${titled(result, "Frequently asked questions").id})`)
    const install = titled(result, "Install").markdown
    expect(install.startsWith("Screenshot\n")).toBe(true)
    expect(install).toContain("![Build status](https://example.com/badge.svg)")
    expect(install).toContain("Download the installer, then")
    expect(install).toContain(`see the [faq](/d/${titled(result, "Frequently asked questions").id}).`)
    expect(result).toMatchObject({ localImages: 1, unlinked: 1 })
  })

  it("turns a folder into a document when it lands inside one", () => {
    const result = plan([{ path: "guides/install.md", text: "x" }], true)
    expect(result.folders).toEqual([])
    expect(result.documents.map((document) => [document.title, document.parent.kind, document.path])).toEqual([
      ["guides", "target", null],
      ["install", "document", "guides/install.md"],
    ])
  })

  it("picks the note beside the link when two share a name", () => {
    const result = plan([
      { path: "a/Note.md", text: "[[Index]]" },
      { path: "a/Index.md", text: "a" },
      { path: "b/deep/Index.md", text: "b" },
      { path: "c/Other.md", text: "[[Index]] [[deep/Index]] [[Getting Started]]" },
      { path: "Getting-Started.md", text: "wiki" },
    ])
    const at = (path: string) => `/d/${result.documents.find((document) => document.path === path)!.id}`
    expect(titled(result, "Note").markdown).toBe(`[Index](${at("a/Index.md")})`)
    expect(titled(result, "Other").markdown).toBe(
      `[Index](${at("a/Index.md")}) [deep/Index](${at("b/deep/Index.md")}) [Getting Started](${at("Getting-Started.md")})`
    )
  })

  it("skips a note too large to edit, and refuses too many", () => {
    expect(plan([{ path: "big.md", text: "x".repeat(MAX_FILE_BYTES + 1) }])).toMatchObject({
      documents: [],
      skipped: [{ path: "big.md", reason: "too-large" }],
    })
    expect(tooManyDocuments(MAX_DOCUMENTS)).toBeNull()
    expect(tooManyDocuments(MAX_DOCUMENTS + 1)).toContain("2,000")
  })
})

describe("batches", () => {
  it("keeps parents ahead of children and sends each folder once, with the first document that needs it", () => {
    const files = Array.from({ length: 60 }, (_, index) => ({ path: `f${index % 3}/sub/n${index}.md`, text: "text" }))
    const result = plan(files)
    const batches = makeBatches(result)
    expect(batches.map((batch) => batch.documents.length)).toEqual([MAX_BATCH_DOCUMENTS, MAX_BATCH_DOCUMENTS, 10])
    expect(batches.flatMap((batch) => batch.folders)).toHaveLength(6)

    const made = new Set<string>()
    for (const batch of batches) {
      for (const folder of batch.folders) {
        if (folder.parent.kind === "folder") expect(made.has(folder.parent.id)).toBe(true)
        made.add(folder.id)
      }
      for (const document of batch.documents) {
        if (document.parent.kind !== "target") expect(made.has(document.parent.id)).toBe(true)
        made.add(document.id)
      }
    }
  })

  it("splits by size as sent, where a line break is two bytes", () => {
    const result = plan(Array.from({ length: 4 }, (_, index) => ({ path: `n${index}.md`, text: "line\n".repeat(50_000) })))
    const batches = makeBatches(result)
    expect(batches.length).toBeGreaterThan(1)
    for (const batch of batches) expect(JSON.stringify(batch).length).toBeLessThanOrEqual(MAX_BATCH_BYTES)
  })
})

describe("zip safety", () => {
  it("lists and reads an ordinary zip", async () => {
    const zip = zipOf({ "a/b.md": strToU8("# B\n"), "empty/": new Uint8Array() })
    const entries = await listZip(zip)
    expect(entries.map((entry) => [entry.name, entry.directory])).toEqual([["a/b.md", false], ["empty/", true]])
    expect(new TextDecoder().decode((await readZipEntry(zip, entries[0], 1000))!)).toBe("# B\n")
  })

  it("skips entries whose paths climb out, and clutter", async () => {
    const zip = zipOf({
      "../../evil.md": strToU8("x"),
      "/abs.md": strToU8("x"),
      "__MACOSX/._note.md": strToU8("x"),
      ".git/config.md": strToU8("x"),
      "ok.md": strToU8("fine"),
    })
    const collected = await collect([{ path: "hostile.zip", file: zip }])
    expect(collected.files).toEqual([{ path: "ok.md", text: "fine" }])
    expect(collected.skipped).toEqual([
      { path: "../../evil.md", reason: "unsafe-path" },
      { path: "/abs.md", reason: "unsafe-path" },
    ])
  })

  it("refuses a zip with too many entries before unpacking any", async () => {
    const files: Record<string, Uint8Array> = {}
    for (let index = 0; index <= MAX_ZIP_ENTRIES; index++) files[`n${index}.md`] = strToU8("x")
    await expect(collect([{ path: "many.zip", file: zipOf(files) }])).rejects.toThrow(CollectError)
  })

  it("stops unpacking an entry that is larger than it claims", async () => {
    // Ten megabytes of zeros, in a zip whose directory says ten bytes.
    const bytes = zipSync({ "bomb.md": new Uint8Array(10_000_000) })
    const data = new DataView(bytes.buffer)
    let at = bytes.length - 22
    while (data.getUint32(at, true) !== 0x06054b50) at--
    data.setUint32(data.getUint32(at + 16, true) + 24, 10, true)
    const zip = new Blob([bytes as BlobPart])

    const [entry] = await listZip(zip)
    expect(entry.size).toBe(10)
    expect(await readZipEntry(zip, entry, MAX_FILE_BYTES)).toBeNull()
    expect(await collect([{ path: "bomb.zip", file: zip }])).toEqual({ files: [], skipped: [{ path: "bomb.md", reason: "too-large" }] })
  })

  it("does not unpack what it will not import", async () => {
    const zip = zipOf({ "video.mp4": new Uint8Array(5_000_000), "huge.md": new Uint8Array(MAX_FILE_BYTES + 1), "note.md": strToU8("hi") })
    expect(await collect([{ path: "vault.zip", file: zip }])).toEqual({
      files: [{ path: "note.md", text: "hi" }],
      skipped: [
        { path: "video.mp4", reason: "unsupported" },
        { path: "huge.md", reason: "too-large" },
      ],
    })
  })

  it("opens the zips inside a zip, once, as Notion's large exports need", async () => {
    const part = zipSync({ "Page 0123456789abcdef0123456789abcdef.md": strToU8("# Page\n") })
    const nested = zipSync({ "deeper.zip": zipSync({ "too-deep.md": strToU8("x") }), "in-part-2.md": strToU8("y") })
    const collected = await collect([{ path: "Export.zip", file: zipOf({ "Export-Part-1.zip": part, "Export-Part-2.zip": nested }) }])
    expect(collected.files.map((file) => file.path)).toEqual(["Page 0123456789abcdef0123456789abcdef.md", "in-part-2.md"])
    expect(collected.skipped).toEqual([{ path: "deeper.zip", reason: "unsupported" }])
  })

  it("says so when a file is not a zip, and skips text that is not text", async () => {
    await expect(collect([{ path: "fake.zip", file: new Blob(["not a zip"]) }])).rejects.toThrow("fake.zip: This file is not a zip")
    expect((await collect([{ path: "binary.txt", file: new Blob([new Uint8Array([72, 0, 105])]) }])).skipped).toEqual([
      { path: "binary.txt", reason: "unreadable" },
    ])
  })
})

describe("dropped folders", () => {
  // What the browser hands over for a drop: entries that are files or
  // directories, the latter read a page at a time.
  const fileEntry = (fullPath: string, text: string) => ({
    name: fullPath.slice(fullPath.lastIndexOf("/") + 1),
    fullPath,
    isFile: true,
    isDirectory: false,
    file: (resolve: (file: Blob) => void) => resolve(new Blob([text])),
  })
  const directoryEntry = (fullPath: string, children: unknown[]) => ({
    name: fullPath.slice(fullPath.lastIndexOf("/") + 1),
    fullPath,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      const pages = [children.slice(0, 1), children.slice(1), []]
      return { readEntries: (resolve: (page: unknown[]) => void) => resolve(pages.shift()!) }
    },
  })

  it("walks directories, every page of them, and takes loose files that have no entry", async () => {
    const vault = directoryEntry("/vault", [
      fileEntry("/vault/a.md", "a"),
      directoryEntry("/vault/sub", [fileEntry("/vault/sub/b.md", "b")]),
      directoryEntry("/vault/.obsidian", [fileEntry("/vault/.obsidian/app.json", "{}")]),
    ])
    const items = [
      { kind: "file", webkitGetAsEntry: () => vault },
      { kind: "file", webkitGetAsEntry: () => null, getAsFile: () => new File(["c"], "loose.md") },
      { kind: "string", webkitGetAsEntry: () => null },
    ]
    const picked = await pickedFromDrop({ items } as unknown as DataTransfer)
    expect(picked.map((file) => file.path)).toEqual(["loose.md", "vault/a.md", "vault/sub/b.md"])
    expect((await collect(picked)).files).toEqual([
      { path: "loose.md", text: "c" },
      { path: "vault/a.md", text: "a" },
      { path: "vault/sub/b.md", text: "b" },
    ])
  })
})
