import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { limitMessage } from "@/lib/billing/limit"
import type { Database } from "@/lib/supabase/database.types"
import { writeNewDocuments } from "@/lib/sync/server-document"
import { uuidV5 } from "@/lib/whiteboard/description-document"
import { DEFAULT_SIZE, edgesMap, nodesMap, toYMap } from "@/lib/whiteboard/schema"

import { MAX_FILE_BYTES } from "./github-provider"
import { edgeSides, layoutBoard, nodeWidth } from "./layout"
import { findSubcanvasFiles, mapFolders } from "./mapping"
import { ROOT } from "./paths"
import { HEADING_KEY, planImport, type PlannedBoard } from "./plan"
import {
  RepositoryError,
  type RepositoryFile,
  type RepositoryProvider,
  type RepositoryReference,
} from "./provider"
import { markdownToBlocks, writeBlocks } from "./readme-document"
import type { DocumentSource, ProjectSource } from "./source"
import { MAX_SUBCANVAS_FILE_BYTES, parseSubcanvasFile, type SubcanvasFile } from "./subcanvas-file"

// Draws a repository as a project: a whiteboard of its folders, whiteboards
// inside those for the folders inside them, each README as a read-only
// document, and the arrows its `.subcanvas` files declare. A one-time copy;
// keeping it current on every push is the next step (docs/ROADMAP.md,
// section 3).

export type ImportOutcome =
  | { ok: true; projectId: string; documentId: string; folders: number; warnings: string[] }
  | { error: string; limit?: true }

const CONCURRENT_READS = 6
const MAX_SUBCANVAS_FILES = 100
// All READMEs of one import together. Past this the rest are left out.
const MAX_TOTAL_BYTES = 4_000_000
const HEADING_WIDTH = 440
const HEADING_GAP = 32

// Runs `task` over `items`, a few at a time, keeping the order.
async function mapLimited<T, R>(items: T[], task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_READS, items.length) }, worker))
  return results
}

export async function importRepository(
  supabase: SupabaseClient<Database>,
  provider: RepositoryProvider,
  reference: RepositoryReference,
  { orgId, userId, makePublic }: { orgId: string; userId: string; makePublic: boolean }
): Promise<ImportOutcome> {
  // Everything is read and worked out before anything is written, so the
  // likely failures (no such repository, rate limit) leave nothing behind.
  let gathered: Awaited<ReturnType<typeof gather>>
  try {
    gathered = await gather(provider, reference)
  } catch (error) {
    if (error instanceof RepositoryError) return { error: error.message }
    throw error
  }
  const { repository } = gathered

  const source: ProjectSource = {
    provider: "github",
    repository: repository.repository,
    ref: repository.ref,
    commit: repository.commit,
  }
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      org_id: orgId,
      name: repository.repository.split("/")[1],
      visibility: makePublic ? "public" : "private",
      created_by: userId,
      source,
    })
    .select("id")
    .single()
  if (projectError)
    return {
      error:
        projectError.code === "42501"
          ? "You do not have permission to create projects."
          : projectError.message,
    }

  // Half a project is worse than none, however it came to be half.
  const discard = () => supabase.rpc("discard_import", { p_project_id: project.id })
  let drawn: Awaited<ReturnType<typeof draw>>
  try {
    drawn = await draw(gathered, source, { orgId, projectId: project.id, userId })
    const failure = await write(supabase, drawn)
    if (failure) {
      await discard()
      return failure
    }
  } catch (error) {
    await discard()
    throw error
  }

  return {
    ok: true,
    projectId: project.id,
    documentId: drawn.topDocumentId,
    folders: gathered.folders,
    warnings: gathered.warnings,
  }
}

async function write(
  supabase: SupabaseClient<Database>,
  { rows, contents }: Awaited<ReturnType<typeof draw>>
): Promise<{ error: string; limit?: true } | null> {
  const { error } = await supabase.from("documents").insert(rows)
  if (error) {
    // A private project counts against the free plan like any other.
    const limit = limitMessage(error.code)
    return limit ? { error: limit, limit: true } : { error: error.message }
  }
  const written = await writeNewDocuments(supabase, contents)
  return written.error ? { error: written.error } : null
}

// Reads the repository and decides what to draw.
async function gather(provider: RepositoryProvider, reference: RepositoryReference) {
  const repository = await provider.describe(reference)
  const { files } = await provider.listFiles(repository)
  const warnings: string[] = []

  const candidates = [...findSubcanvasFiles(files)].slice(0, MAX_SUBCANVAS_FILES)
  const subcanvasFiles = new Map<string, SubcanvasFile>()
  await mapLimited(candidates, async ([folder, file]) => {
    const text = file.size > MAX_SUBCANVAS_FILE_BYTES ? null : await provider.readFile(repository, file.path)
    const parsed = parseSubcanvasFile(text ?? "", folder)
    if (text === null) warnings.push(`${file.path}: the file could not be read, so it only marks the folder.`)
    warnings.push(...parsed.warnings)
    subcanvasFiles.set(folder, parsed.file)
  })

  const mapping = mapFolders(files, [...subcanvasFiles.values()].flatMap((file) => file.ignore))
  if (!mapping.folders.length)
    throw new RepositoryError(
      "nothing_to_map",
      "There is nothing here to draw: this repository has no folders that hold code or a README."
    )
  // A file inside an ignored folder no longer speaks for anything.
  const mapped = new Set(mapping.folders.map((folder) => folder.path))
  for (const folder of subcanvasFiles.keys())
    if (folder !== ROOT && !mapped.has(folder)) subcanvasFiles.delete(folder)

  const wanted: [string, RepositoryFile][] = mapping.folders.flatMap((folder) =>
    folder.readme ? [[folder.path, folder.readme]] : []
  )
  if (mapping.rootReadme) wanted.unshift([ROOT, mapping.rootReadme])

  let total = 0
  let skipped = 0
  const readmes = new Map<string, string>()
  await mapLimited(
    wanted.filter(([, file]) => {
      const fits = file.size <= MAX_FILE_BYTES && total + file.size <= MAX_TOTAL_BYTES
      if (fits) total += file.size
      else skipped++
      return fits
    }),
    async ([folder, file]) => {
      const text = await provider.readFile(repository, file.path)
      if (text !== null) readmes.set(folder, text)
      else skipped++
    }
  )
  if (skipped)
    warnings.push(
      `${skipped} ${skipped === 1 ? "README was" : "READMEs were"} too large or could not be read, and ${skipped === 1 ? "was" : "were"} left out.`
    )

  // A README that was not read is not offered as a document.
  const readable = {
    ...mapping,
    rootReadme: readmes.has(ROOT) ? mapping.rootReadme : null,
    folders: mapping.folders.map((folder) => (readmes.has(folder.path) ? folder : { ...folder, readme: null })),
  }
  const plan = planImport({ repository, mapping: readable, subcanvasFiles, readmes })

  // The text documents, converted: READMEs by file path, and the notes that
  // explain arrows by their text.
  const documents = new Map<string, Blocks>()
  // One at a time: the converter borrows the process's DOM globals while it runs.
  for (const [folder, file] of wanted) {
    const text = readmes.get(folder)
    if (text !== undefined)
      documents.set(file.path, await markdownToBlocks(text, { repository, readmePath: file.path }))
  }
  for (const board of plan.boards)
    for (const edge of board.edges)
      if (edge.description) documents.set(edge.description, await markdownToBlocks(edge.description))

  return {
    repository,
    boards: plan.boards,
    documents,
    warnings: [...warnings, ...plan.warnings],
    folders: mapping.folders.length,
  }
}

type Blocks = Awaited<ReturnType<typeof markdownToBlocks>>
type DocumentRow = Database["public"]["Tables"]["documents"]["Insert"]

// Gives everything an id and a place, and returns the document rows to
// insert (parents before children) with the content of each.
async function draw(
  { boards, documents }: { boards: PlannedBoard[]; documents: Map<string, Blocks> },
  source: ProjectSource,
  { orgId, projectId, userId }: { orgId: string; projectId: string; userId: string }
) {
  const rows: DocumentRow[] = []
  const contents: Parameters<typeof writeNewDocuments>[1] = []
  const boardIds = new Map(boards.map((board) => [board.folder, crypto.randomUUID()]))
  // Where each nested whiteboard lives: the node that opens it.
  const homes = new Map<string, { documentId: string; objectId: string }>()
  const startedAt = Date.now()

  // Every row carries every key: a bulk insert takes its columns from the
  // first row.
  const row = (fields: Pick<DocumentRow, "id" | "type" | "title"> & Partial<DocumentRow>): DocumentRow => ({
    org_id: orgId,
    project_id: projectId,
    kind: "standard",
    parent_document_id: null,
    parent_object_id: null,
    source: null,
    created_by: userId,
    position: startedAt + rows.length,
    ...fields,
  })

  for (const board of boards) {
    const documentId = boardIds.get(board.folder)!
    const home = homes.get(board.folder)
    rows.push(
      row({
        id: documentId,
        type: "whiteboard",
        title: board.title,
        parent_document_id: home?.documentId ?? null,
        parent_object_id: home?.objectId ?? null,
      })
    )

    const boxes = board.nodes.filter((node) => node.kind === "plain")
    // One width per whiteboard, so rows and columns line up.
    const width = Math.max(...boxes.map((node) => nodeWidth(node.title, node.path)))
    const height = DEFAULT_SIZE.plain.height!
    const nodeIds = new Map(board.nodes.map((node) => [node.key, crypto.randomUUID()]))
    const positions = layoutBoard(
      boxes.map((node) => ({ id: node.key, width, height })),
      board.edges
    )

    const nodes = board.nodes.map((node) => {
      const id = nodeIds.get(node.key)!
      if (node.key === HEADING_KEY)
        return [id, { kind: "text", x: 0, y: -headingHeight(node.description) - HEADING_GAP, width: HEADING_WIDTH, title: node.title, description: node.description, color: "default" }] as const

      let held: { docId: string; docType: "text" | "whiteboard"; openMode: "panel" | "navigate" } | null = null
      if (node.holds?.kind === "board") {
        homes.set(node.holds.folder, { documentId, objectId: id })
        held = { docId: boardIds.get(node.holds.folder)!, docType: "whiteboard", openMode: "navigate" }
      } else if (node.holds?.kind === "readme") {
        const blocks = documents.get(node.holds.file.path)!
        const docId = crypto.randomUUID()
        const documentSource: DocumentSource = { ...source, path: node.holds.file.path }
        rows.push(
          row({
            id: docId,
            type: "text",
            title: node.title,
            parent_document_id: documentId,
            parent_object_id: id,
            source: documentSource,
          })
        )
        contents.push({ documentId: docId, change: (doc) => writeBlocks(doc, blocks) })
        held = { docId, docType: "text", openMode: "panel" }
      }

      return [id, { kind: "plain", ...positions.get(node.key)!, width, height, title: node.title, description: node.description, color: "default", path: node.path, ...held }] as const
    })

    const edges = await Promise.all(
      board.edges.map(async (edge) => {
        const id = crypto.randomUUID()
        const box = (key: string) => ({ ...positions.get(key)!, width, height })
        let held: { docId: string; docType: "text"; openMode: "panel" } | null = null
        if (edge.description) {
          // The same id the app derives when someone writes an arrow's
          // description by hand, and the same kind of document.
          const docId = await uuidV5(documentId, id)
          const blocks = documents.get(edge.description)!
          rows.push(
            row({
              id: docId,
              type: "text",
              kind: "description",
              title: edge.label || "Description",
              parent_document_id: documentId,
              parent_object_id: id,
            })
          )
          contents.push({ documentId: docId, change: (doc) => writeBlocks(doc, blocks) })
          held = { docId, docType: "text", openMode: "panel" }
        }
        return [id, { source: nodeIds.get(edge.source)!, target: nodeIds.get(edge.target)!, ...edgeSides(box(edge.source), box(edge.target)), shape: "spline", stroke: "solid", direction: "forward", color: "default", label: edge.label, ...held }] as const
      })
    )

    contents.push({
      documentId,
      change: (doc) => {
        for (const [id, fields] of nodes) nodesMap(doc).set(id, toYMap(fields))
        for (const [id, fields] of edges) edgesMap(doc).set(id, toYMap(fields))
      },
    })
  }

  return { rows, contents, topDocumentId: boardIds.get(ROOT)! }
}

// A text node is as tall as its text. Nothing is measured on the server, so
// this estimates: a heading line, then about sixty characters to a line.
function headingHeight(description: string) {
  return 40 + Math.ceil(description.length / 60) * 21
}
