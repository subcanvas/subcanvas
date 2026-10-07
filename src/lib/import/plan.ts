import { mediaHref, mediaPath, mediaTypeOfName } from "@/lib/whiteboard/media"

import { csvToMarkdown } from "./csv"
import { readHtmlFile } from "./html-file"
import { MAX_DOCUMENTS, MAX_FILE_BYTES, MAX_HTML_FILE_BYTES } from "./limits"
import { rewriteHtmlLinks, rewriteLinks, type LinkTargets } from "./links"
import { cleanName, readMarkdownFile, titleFromPath } from "./markdown-file"
import { baseName, kindOf, parentOf, withoutExtension } from "./paths"

// Decides what a set of files becomes: which folders, which documents, what
// nests under what, and where every link between them now points. Nothing
// is written here. The browser plans what a person picked so it can show
// them before it starts; the MCP tool plans what an agent sent.

export type SourceFile = { path: string; text: string }

export type SkipReason =
  | "unsupported"
  | "too-large"
  | "table-too-large"
  | "unreadable"
  | "protected"
  | "unsafe-path"
  | "image"
  | "whiteboard"
export type Skipped = { path: string; reason: SkipReason }

// Where a planned item goes: the place the person chose, or something else
// in the same plan.
export type PlannedParent = { kind: "target" } | { kind: "folder"; id: string } | { kind: "document"; id: string }

export type PlannedFolder = { id: string; name: string; parent: { kind: "target" } | { kind: "folder"; id: string } }
export type PlannedDocument = {
  id: string
  // The file it came from. A document that only stands in for a folder has none.
  path: string | null
  title: string
  parent: PlannedParent
  markdown: string
  // A page read from HTML is sent as HTML, cut down to what the editor
  // holds (lib/import/html-file.ts), and `markdown` is empty.
  html?: string
}

// A picture or video of the import's, to be uploaded once the document that
// shows it exists: `source` is its path in the import, `path` where Storage
// keeps it, filed under that document.
export type PlannedUpload = { documentId: string; source: string; path: string }

export type ImportPlan = {
  // Both lists are ordered so that a parent comes before what it holds.
  folders: PlannedFolder[]
  documents: PlannedDocument[]
  skipped: Skipped[]
  localImages: number
  unlinked: number
  // Databases whose table was too large to put in their page (their rows
  // are still pages of their own).
  tablesLeftOut: number
  uploads: PlannedUpload[]
}

export type PlanOptions = {
  // Whether the chosen place is a document. Folders cannot go inside one.
  intoDocument: boolean
  // The import's files that are not notes, which notes may show or link to.
  attachments?: string[]
  newId: () => string
  hrefFor: (documentId: string) => string
  // Where pictures go, and which of the import's files can be uploaded.
  // Without it, pictures are left as the words that describe them, as they
  // are for an agent's import, which sends no files.
  media?: { orgId: string; projectId: string; has: (path: string) => boolean }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
const key = (path: string) => path.toLowerCase()
// GitHub wikis name the file of "Getting Started" `Getting-Started.md`.
const nameKey = (name: string) => name.toLowerCase().replace(/-/g, " ")

export function tooManyDocuments(count: number) {
  return count > MAX_DOCUMENTS
    ? `This is ${count.toLocaleString("en")} documents, and one import takes up to ${MAX_DOCUMENTS.toLocaleString("en")}. Import it a folder at a time.`
    : null
}

// Notion puts a workspace export in one folder, "Export-<uuid>", which is
// the export's and not a folder of the person's.
const EXPORT_FOLDER = /^Export-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i
function withoutExportFolder(paths: string[]) {
  const first = paths[0] && EXPORT_FOLDER.exec(paths[0])?.[0]
  return first && paths.every((path) => path.startsWith(first)) ? first.length : 0
}

// Notion names the folder of a page's subpages after the page: "Title <id>"
// until 2025, "Title" in 2026, and "Title <first 4>-<last 4> of the id"
// when two pages beside each other share a title.
const NOTION_PAGE_ID = /\s([0-9a-f]{32})(?:_all)?\.\w+$/i
const NOTION_SHORT_ID = /^(.*) ([0-9a-f]{4})-([0-9a-f]{4})$/i

export function planImport(files: SourceFile[], { intoDocument, attachments = [], newId, hrefFor, media }: PlanOptions): ImportPlan {
  const skipped: Skipped[] = []
  const cut = withoutExportFolder([...files.map((file) => file.path), ...attachments])
  // Put back in front of a path to name the file as the import has it.
  const prefix = cut ? (files[0]?.path ?? attachments[0]).slice(0, cut) : ""
  if (cut) {
    files = files.map((file) => ({ ...file, path: file.path.slice(cut) }))
    attachments = attachments.map((path) => path.slice(cut))
  }
  const paths = new Set(files.map((file) => file.path))

  // What each file says, before anything is placed.
  const notes: { path: string; title: string; body: string; html?: HTMLElement }[] = []
  let tablesLeftOut = 0
  for (const file of [...files].sort((a, b) => collator.compare(a.path, b.path))) {
    const html = kindOf(file.path) === "html"
    if (file.text.length > (html ? MAX_HTML_FILE_BYTES : MAX_FILE_BYTES)) {
      skipped.push({ path: file.path, reason: "too-large" })
    } else if (html) {
      const page = readHtmlFile(file.path, file.text)
      if (!page) continue
      if (page.root.innerHTML.length > MAX_FILE_BYTES) skipped.push({ path: file.path, reason: "too-large" })
      else {
        notes.push({ path: file.path, title: page.title, body: "", html: page.root })
        if (page.tableLeftOut) tablesLeftOut++
      }
    } else if (kindOf(file.path) === "csv") {
      // Notion writes some databases twice; "_all" has the hidden columns too.
      if (/_all\.csv$/i.test(file.path) && paths.has(file.path.replace(/_all\.csv$/i, ".csv"))) continue
      // Its HTML export writes a database as a page too, which says more.
      if (paths.has(file.path.replace(/(_all)?\.csv$/i, ".html"))) continue
      const table = csvToMarkdown(file.text)
      if (table) notes.push({ path: file.path, title: titleFromPath(file.path).replace(/_all$/, ""), body: table })
      else skipped.push({ path: file.path, reason: "table-too-large" })
    } else notes.push({ path: file.path, ...readMarkdownFile(file.path, file.text) })
  }

  // A page with subpages: Notion writes `Page.md` and, next to it, a folder
  // `Page` holding them. Documents nest here, so the folder's contents go
  // inside the page's document. Notes come before tables when both claim it.
  const pageOfFolder = new Map<string, string>()
  const ids = new Map<string, string>()
  for (const note of notes) {
    ids.set(note.path, newId())
    const folder = key(withoutExtension(note.path))
    if (!pageOfFolder.has(folder) || kindOf(note.path) !== "csv") pageOfFolder.set(folder, note.path)
  }
  // Folders named without the whole id: each goes to the page beside it
  // with that title, the one whose short id it has, or else the one with
  // that title that has no folder of its own yet. A page comes before a
  // table: an inline database is only a table beside its folder of rows.
  const existing = new Set<string>()
  for (const path of [...notes.map((note) => note.path), ...attachments])
    for (let folder = parentOf(path); folder; folder = parentOf(folder)) existing.add(folder)
  const claimed = new Set([...existing].map((folder) => pageOfFolder.get(key(folder))).filter(Boolean))
  const titleOf = (path: string) => cleanName(withoutExtension(baseName(path))).toLowerCase()
  const byShortIdFirst = [...existing].sort((a, b) => Number(!NOTION_SHORT_ID.test(baseName(a))) - Number(!NOTION_SHORT_ID.test(baseName(b))))
  for (const folder of byShortIdFirst) {
    if (pageOfFolder.has(key(folder))) continue
    const beside = notes.filter((note) => parentOf(note.path) === parentOf(folder))
    const pages = [...beside.filter((note) => kindOf(note.path) !== "csv"), ...beside.filter((note) => kindOf(note.path) === "csv")]
    const short = NOTION_SHORT_ID.exec(baseName(folder))
    const page = short
      ? pages.find((note) => {
          const id = NOTION_PAGE_ID.exec(note.path)?.[1].toLowerCase()
          return titleOf(note.path) === short[1].toLowerCase() && id?.startsWith(short[2].toLowerCase()) && id.endsWith(short[3].toLowerCase())
        })
      : pages.find((note) => titleOf(note.path) === baseName(folder).toLowerCase() && !claimed.has(note.path))
    if (!page) continue
    pageOfFolder.set(key(folder), page.path)
    claimed.add(page.path)
  }

  const folders: PlannedFolder[] = []
  const holders: PlannedDocument[] = []
  const placed = new Map<string, PlannedParent>()

  // What stands for a folder of the import, made the first time it is needed.
  function containerFor(folder: string): PlannedParent {
    if (!folder) return { kind: "target" }
    const page = pageOfFolder.get(key(folder))
    if (page) return { kind: "document", id: ids.get(page)! }
    const known = placed.get(key(folder))
    if (known) return known

    const parent = containerFor(parentOf(folder))
    const name = cleanName(baseName(folder))
    let made: PlannedParent
    // Folders hold documents, never the other way round. A folder that ends
    // up under a page becomes an empty document that holds what it held.
    if (parent.kind === "document" || (parent.kind === "target" && intoDocument)) {
      made = { kind: "document", id: newId() }
      holders.push({ id: made.id, path: null, title: name, parent, markdown: "" })
    } else {
      made = { kind: "folder", id: newId() }
      folders.push({ id: made.id, name, parent })
    }
    placed.set(key(folder), made)
    return made
  }

  const byPath = new Map(notes.map((note) => [key(note.path), note.path]))
  const byName = new Map<string, string[]>()
  for (const note of notes) {
    const name = nameKey(withoutExtension(baseName(note.path)))
    for (const known of new Set([name, nameKey(cleanName(name))])) byName.set(known, [...(byName.get(known) ?? []), note.path])
  }
  const hrefOf = (path: string | undefined) => (path ? hrefFor(ids.get(path)!) : null)
  // A page links to others by file, with or without its extension.
  const noteAt = (path: string) =>
    byPath.get(key(path)) ?? byPath.get(key(`${path}.md`)) ?? byPath.get(key(`${path}.html`))

  const attachmentByName = new Map(attachments.map((path) => [key(baseName(path)), path]))

  const targets: LinkTargets = {
    fileNamed: (name) => attachmentByName.get(key(baseName(name))) ?? null,
    // A link may leave the extension off, as wikis do.
    byPath: (path) => hrefOf(noteAt(path)),
    idByPath: (path) => {
      const note = noteAt(path)
      return note ? ids.get(note)! : null
    },
    byName: (name, fromPath) => {
      const wanted = nameKey(name.replace(/\.md$/i, ""))
      const candidates = wanted.includes("/")
        ? notes.map((note) => note.path).filter((path) => `/${nameKey(withoutExtension(path))}`.endsWith(`/${wanted}`))
        : (byName.get(wanted) ?? [])
      // Two notes with one name: the one beside the link, else the shallowest.
      const beside = candidates.find((path) => parentOf(path) === parentOf(fromPath))
      return hrefOf(beside ?? [...candidates].sort((a, b) => a.split("/").length - b.split("/").length)[0])
    },
  }

  let localImages = 0
  let unlinked = 0
  const uploads: PlannedUpload[] = []
  // Each document shows its own copy of a picture, since a file is read by
  // the readers of the document it is filed under; one copy per document.
  const imageUrlFor = (documentId: string) => {
    const mine = new Map<string, string>()
    return (path: string) => {
      const source = prefix + path
      if (!media || !media.has(source)) return null
      const known = mine.get(source)
      if (known) return known
      const type = mediaTypeOfName(source)!
      const stored = mediaPath({ orgId: media.orgId, projectId: media.projectId, documentId }, newId(), extensionOf(type))
      uploads.push({ documentId, source, path: stored })
      mine.set(source, mediaHref(stored))
      return mine.get(source)!
    }
  }
  const documents: PlannedDocument[] = notes.map((note) => {
    const targetsHere = { ...targets, imageUrl: imageUrlFor(ids.get(note.path)!) }
    if (note.html) {
      const rewritten = rewriteHtmlLinks(note.html, note.path, targetsHere)
      localImages += rewritten.localImages
      unlinked += rewritten.unlinked
      return {
        id: ids.get(note.path)!,
        path: note.path,
        title: note.title,
        parent: containerFor(parentOf(note.path)),
        markdown: "",
        html: note.html.innerHTML,
      }
    }
    const rewritten = rewriteLinks(note.body, note.path, targetsHere)
    localImages += rewritten.localImages
    unlinked += rewritten.unlinked
    return {
      id: ids.get(note.path)!,
      path: note.path,
      title: note.title,
      parent: containerFor(parentOf(note.path)),
      markdown: rewritten.markdown,
    }
  })

  return {
    folders,
    documents: parentsFirst([...holders, ...documents]),
    skipped,
    localImages,
    unlinked,
    tablesLeftOut,
    uploads,
  }
}

const extensionOf = (type: string) => (type === "image/jpeg" ? "jpg" : type === "video/quicktime" ? "mov" : type.split("/")[1])

// Each document after the one it nests under, and siblings by title, the
// way a file browser lists them.
function parentsFirst(documents: PlannedDocument[]) {
  const children = new Map<string, PlannedDocument[]>()
  const top: PlannedDocument[] = []
  for (const document of documents) {
    if (document.parent.kind !== "document") top.push(document)
    else children.set(document.parent.id, [...(children.get(document.parent.id) ?? []), document])
  }
  const ordered: PlannedDocument[] = []
  const visit = (list: PlannedDocument[]) => {
    for (const document of [...list].sort((a, b) => collator.compare(a.title, b.title))) {
      ordered.push(document)
      visit(children.get(document.id) ?? [])
    }
  }
  visit(top)
  return ordered
}
