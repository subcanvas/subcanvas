// What of a project is in view: not in the trash, and not inside something
// that is. It is the database's rule (private.document_is_live, and
// public.documents_in_view, in the migrations trash_and_limits and
// out_of_view), for code that already holds the whole tree: a folder is in
// view when it and every folder above it are out of the trash; a document
// when it and every document above it are, and the topmost one is at the
// top of the project or in a folder in view.

export type InViewFolder = { id: string; parent_folder_id: string | null; deleted_at: string | null }
export type InViewDocument = {
  id: string
  folder_id: string | null
  parent_document_id: string | null
  deleted_at: string | null
}

export function inView(folders: InViewFolder[], documents: InViewDocument[]) {
  const liveFolders = new Set<string>()
  const liveDocuments = new Set<string>()

  // Walked from the top down, as the database does, so something whose
  // parent is not in the lists is out of view too.
  const foldersIn = new Map<string | null, InViewFolder[]>()
  for (const folder of folders)
    foldersIn.set(folder.parent_folder_id, [...(foldersIn.get(folder.parent_folder_id) ?? []), folder])
  const documentsIn = new Map<string | null, InViewDocument[]>()
  const nestedIn = new Map<string, InViewDocument[]>()
  for (const document of documents) {
    if (document.parent_document_id)
      nestedIn.set(document.parent_document_id, [...(nestedIn.get(document.parent_document_id) ?? []), document])
    else documentsIn.set(document.folder_id, [...(documentsIn.get(document.folder_id) ?? []), document])
  }

  const folderQueue: (string | null)[] = [null]
  const documentQueue: InViewDocument[] = []
  while (folderQueue.length) {
    const folderId = folderQueue.pop()!
    for (const folder of foldersIn.get(folderId) ?? [])
      if (!folder.deleted_at && !liveFolders.has(folder.id)) {
        liveFolders.add(folder.id)
        folderQueue.push(folder.id)
      }
    documentQueue.push(...(documentsIn.get(folderId) ?? []))
  }
  while (documentQueue.length) {
    const document = documentQueue.pop()!
    if (document.deleted_at || liveDocuments.has(document.id)) continue
    liveDocuments.add(document.id)
    documentQueue.push(...(nestedIn.get(document.id) ?? []))
  }

  return { folders: liveFolders, documents: liveDocuments }
}
