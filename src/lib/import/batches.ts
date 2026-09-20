import { MAX_BATCH_BYTES, MAX_BATCH_DOCUMENTS } from "./limits"
import type { ImportPlan, PlannedDocument, PlannedFolder } from "./plan"

// An import goes to the server a batch at a time: a request body has a size
// limit, each batch is converted within one request's time, and between two
// batches the person can stop. A batch carries the folders its documents
// need that no earlier batch has made.

export type ImportBatch = { folders: PlannedFolder[]; documents: PlannedDocument[] }

const encoder = new TextEncoder()
// As sent: JSON, in UTF-8. A newline or a quote is two bytes there.
const sizeOf = (value: unknown) => encoder.encode(JSON.stringify(value)).length

export function makeBatches(plan: Pick<ImportPlan, "folders" | "documents">): ImportBatch[] {
  const folderById = new Map(plan.folders.map((folder) => [folder.id, folder]))
  const order = new Map(plan.folders.map((folder, index) => [folder.id, index]))
  const sent = new Set<string>()

  // The folder a document sits in and every folder above it, outermost first.
  const foldersFor = (document: PlannedDocument) => {
    const chain: PlannedFolder[] = []
    let parent: PlannedDocument["parent"] | PlannedFolder["parent"] = document.parent
    while (parent.kind === "folder" && !sent.has(parent.id)) {
      const folder: PlannedFolder = folderById.get(parent.id)!
      chain.push(folder)
      sent.add(folder.id)
      parent = folder.parent
    }
    return chain.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  }

  const batches: ImportBatch[] = []
  let batch: ImportBatch = { folders: [], documents: [] }
  let bytes = 0
  for (const document of plan.documents) {
    const folders = foldersFor(document)
    const size = sizeOf(document) + sizeOf(folders)
    if (batch.documents.length && (batch.documents.length >= MAX_BATCH_DOCUMENTS || bytes + size > MAX_BATCH_BYTES)) {
      batches.push(batch)
      batch = { folders: [], documents: [] }
      bytes = 0
    }
    batch.folders.push(...folders)
    batch.documents.push(document)
    bytes += size
  }
  if (batch.documents.length) batches.push(batch)
  return batches
}
