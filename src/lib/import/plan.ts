import { csvToMarkdown } from "./csv"
import { MAX_DOCUMENTS, MAX_FILE_BYTES } from "./limits"
import { rewriteLinks, type LinkTargets } from "./links"
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
}

export type ImportPlan = {
  // Both lists are ordered so that a parent comes before what it holds.
  folders: PlannedFolder[]
  documents: PlannedDocument[]
  skipped: Skipped[]
  localImages: number
  unlinked: number
}

export type PlanOptions = {
  // Whether the chosen place is a document. Folders cannot go inside one.
  intoDocument: boolean
  // The import's files that are not notes, which notes may show or link to.
  attachments?: string[]
  newId: () => string
  hrefFor: (documentId: string) => string
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

export function planImport(files: SourceFile[], { intoDocument, attachments = [], newId, hrefFor }: PlanOptions): ImportPlan {
  const skipped: Skipped[] = []
  const paths = new Set(files.map((file) => file.path))

  // What each file says, before anything is placed.
  const notes: { path: string; title: string; body: string }[] = []
  for (const file of [...files].sort((a, b) => collator.compare(a.path, b.path))) {
    if (file.text.length > MAX_FILE_BYTES) {
      skipped.push({ path: file.path, reason: "too-large" })
    } else if (kindOf(file.path) === "csv") {
      // Notion writes some databases twice; "_all" has the hidden columns too.
      if (/_all\.csv$/i.test(file.path) && paths.has(file.path.replace(/_all\.csv$/i, ".csv"))) continue
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
    if (!pageOfFolder.has(folder) || kindOf(note.path) === "markdown") pageOfFolder.set(folder, note.path)
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

  const attachmentByName = new Map(attachments.map((path) => [key(baseName(path)), path]))

  const targets: LinkTargets = {
    fileNamed: (name) => attachmentByName.get(key(baseName(name))) ?? null,
    // A link may leave the extension off, as wikis do.
    byPath: (path) => hrefOf(byPath.get(key(path)) ?? byPath.get(key(`${path}.md`))),
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
  const documents: PlannedDocument[] = notes.map((note) => {
    const rewritten = rewriteLinks(note.body, note.path, targets)
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
  }
}

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
