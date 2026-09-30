import { inView } from "@/lib/documents/in-view"

// Where everything goes in a project's export (docs/EXPORTING.md). Pure, so
// the server that lists a project and the browser that writes the zip agree,
// and so the rules can be tested without either.
//
//   Folder/                      a folder
//   Folder/Page.md               a text document
//   Folder/Page/                 what the page holds: nested documents, and
//                                the pictures and videos it shows
//   Board.svg, Board.json        a whiteboard: its picture and its contents
//   Board/                       what its boxes hold, and its pictures
//
// It is the layout a Notion export has, which is what Import files already
// reads back: a page with a folder of the same name beside it holds what is
// in that folder.

export type ExportFolderRow = { id: string; name: string; parent_folder_id: string | null; position: number }

export type ExportDocumentRow = {
  id: string
  title: string
  type: "text" | "whiteboard"
  // A box's description (R4.2) is a text document the tree does not show.
  kind: "standard" | "description"
  folder_id: string | null
  parent_document_id: string | null
  position: number
}

export type LaidOutFolder = { id: string; name: string; path: string }
export type LaidOutDocument = {
  id: string
  type: "text" | "whiteboard"
  kind: "standard" | "description"
  title: string
  // The document's name in its folder, without an extension. Its files add
  // one, and what it holds goes in the folder of this name.
  path: string
  files: string[]
}

export type ExportLayout = { folders: LaidOutFolder[]; documents: LaidOutDocument[] }

// Files the export writes at its top, beside the project's own.
export const README_FILE = "README.txt"
export const MANIFEST_FILE = "subcanvas-export.json"

export const extensionsOf = (type: "text" | "whiteboard") => (type === "text" ? [".md"] : [".svg", ".json"])

// --- Names ------------------------------------------------------------------

// What no common file system takes in a name: path separators, Windows'
// reserved characters, and control characters.
const SEPARATORS = /[/\\:|]/g
const REMOVED = /[\u0000-\u001f\u007f*?"<>]/g
// Windows refuses these as names, with any extension.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i
// Well under the 255 bytes a name may have, with room for " 12" and ".json".
const MAX_NAME_BYTES = 120

const encoder = new TextEncoder()

function cutToBytes(name: string, max: number) {
  if (encoder.encode(name).length <= max) return name
  let cut = ""
  let bytes = 0
  for (const char of name) {
    bytes += encoder.encode(char).length
    if (bytes > max) break
    cut += char
  }
  return cut
}

// A title as a file or folder name that unzips anywhere. A leading dot would
// hide the file, and imports skip hidden files; Windows drops a trailing dot
// or space.
export function safeName(title: string, fallback = "Untitled") {
  let name = title
    .normalize("NFC")
    // "Payments: refunds" reads better without the colon than with a dash.
    .replace(/:(?=\s)/g, "")
    .replace(SEPARATORS, "-")
    .replace(REMOVED, "")
    .replace(/\s+/g, " ")
  name = cutToBytes(name.replace(/^[\s.]+/, ""), MAX_NAME_BYTES).replace(/[\s.]+$/, "")
  if (!name) name = fallback
  return RESERVED.test(name) ? `_${name}` : name
}

// Claims a name in a folder for something that writes `stem` plus each of
// `suffixes` there (a document writes its files and its folder), adding a
// number until none of them is taken. Names are compared as the file systems
// of Macs and Windows do, without case.
export function claimName(taken: Set<string>, stem: string, suffixes: string[]) {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? stem : `${stem} ${n}`
    const names = suffixes.map((suffix) => `${candidate}${suffix}`.toLowerCase())
    if (names.some((name) => taken.has(name))) continue
    for (const name of names) taken.add(name)
    return candidate
  }
}

const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name)

export const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")))

// --- The layout -------------------------------------------------------------

// Every folder and document that has a place: a document whose parent is not
// in the lists (in the trash, or not readable) is left out with it.
export function layoutExport(folders: ExportFolderRow[], documents: ExportDocumentRow[]): ExportLayout {
  const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position
  const takenIn = new Map<string, Set<string>>([["", new Set([README_FILE.toLowerCase(), MANIFEST_FILE.toLowerCase()])]])
  const taken = (folder: string) => {
    if (!takenIn.has(folder)) takenIn.set(folder, new Set())
    return takenIn.get(folder)!
  }

  const childFolders = new Map<string | null, ExportFolderRow[]>()
  for (const folder of folders)
    childFolders.set(folder.parent_folder_id, [...(childFolders.get(folder.parent_folder_id) ?? []), folder])
  const inFolder = new Map<string | null, ExportDocumentRow[]>()
  const inDocument = new Map<string, ExportDocumentRow[]>()
  for (const document of documents) {
    if (document.parent_document_id)
      inDocument.set(document.parent_document_id, [...(inDocument.get(document.parent_document_id) ?? []), document])
    else inFolder.set(document.folder_id, [...(inFolder.get(document.folder_id) ?? []), document])
  }

  const laidOutFolders: LaidOutFolder[] = []
  const laidOutDocuments: LaidOutDocument[] = []
  const placed = new Set<string>()

  function placeDocument(document: ExportDocumentRow, folder: string) {
    // The database allows no loops of parents; this is not the place to find one.
    if (placed.has(document.id)) return
    placed.add(document.id)
    const extensions = extensionsOf(document.type)
    const path = join(folder, claimName(taken(folder), safeName(document.title), ["", ...extensions]))
    laidOutDocuments.push({
      id: document.id,
      type: document.type,
      kind: document.kind,
      title: document.title,
      path,
      files: extensions.map((extension) => `${path}${extension}`),
    })
    // What the tree shows under it first, then its boxes' descriptions.
    const children = inDocument.get(document.id) ?? []
    const standard = children.filter((child) => child.kind !== "description").sort(byPosition)
    const descriptions = children
      .filter((child) => child.kind === "description")
      .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    for (const child of [...standard, ...descriptions]) placeDocument(child, path)
  }

  function placeFolder(folderId: string | null, path: string) {
    for (const folder of [...(childFolders.get(folderId) ?? [])].sort(byPosition)) {
      const inner = join(path, claimName(taken(path), safeName(folder.name, "Folder"), [""]))
      laidOutFolders.push({ id: folder.id, name: folder.name, path: inner })
      placeFolder(folder.id, inner)
    }
    for (const document of [...(inFolder.get(folderId) ?? [])].sort(byPosition)) placeDocument(document, path)
  }

  placeFolder(null, "")
  return { folders: laidOutFolders, documents: laidOutDocuments }
}

// The project as it is in view: what is in the trash stays out of its
// export, and so does everything inside it (lib/documents/in-view).
export function layoutInView(
  folders: (ExportFolderRow & { deleted_at: string | null })[],
  documents: (ExportDocumentRow & { deleted_at: string | null })[]
): ExportLayout {
  const live = inView(folders, documents)
  return layoutExport(
    folders.filter((folder) => live.folders.has(folder.id)),
    documents.filter((document) => live.documents.has(document.id))
  )
}

// --- Links between files ----------------------------------------------------

// What a Markdown link may not hold as it is: spaces, and what ends or
// confuses an address. The rest, letters of any language included, stays
// readable.
const UNSAFE_IN_LINK = /[\s%()[\]<>#?"'`{}|\\^]/g
const encodeSegment = (segment: string) =>
  segment.replace(UNSAFE_IN_LINK, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)

// The address of `to` from the file `from`, both paths in the export, as a
// Markdown link or a picture writes it.
export function relativeHref(from: string, to: string) {
  const here = from.split("/").slice(0, -1)
  const there = to.split("/")
  let common = 0
  while (common < here.length && common < there.length - 1 && here[common] === there[common]) common++
  return [...here.slice(common).map(() => ".."), ...there.slice(common)].map(encodeSegment).join("/")
}
