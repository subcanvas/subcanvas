export type DocumentType = "text" | "whiteboard"

export type FolderRow = {
  id: string
  name: string
  parent_folder_id: string | null
  position: number
}

export type DocumentRow = {
  id: string
  title: string
  type: DocumentType
  folder_id: string | null
  parent_document_id: string | null
  position: number
}

export type TreeNode =
  | { kind: "folder"; id: string; name: string; children: TreeNode[] }
  | { kind: "document"; id: string; name: string; type: DocumentType; children: TreeNode[] }

// Where an item can live: the project root, a folder, or inside a document.
export type Container =
  | { kind: "root" }
  | { kind: "folder"; id: string }
  | { kind: "document"; id: string }

export function buildTree(folders: FolderRow[], documents: DocumentRow[]): TreeNode[] {
  const byPosition = (a: { position: number }, b: { position: number }) =>
    a.position - b.position

  const documentNode = (row: DocumentRow): TreeNode => ({
    kind: "document",
    id: row.id,
    name: row.title,
    type: row.type,
    children: documents
      .filter((d) => d.parent_document_id === row.id)
      .sort(byPosition)
      .map(documentNode),
  })

  const folderNode = (row: FolderRow): TreeNode => ({
    kind: "folder",
    id: row.id,
    name: row.name,
    children: childrenOf(row.id),
  })

  // Folders first, then documents, each in position order.
  const childrenOf = (folderId: string | null): TreeNode[] => [
    ...folders
      .filter((f) => f.parent_folder_id === folderId)
      .sort(byPosition)
      .map(folderNode),
    ...documents
      .filter((d) => d.folder_id === folderId && d.parent_document_id === null)
      .sort(byPosition)
      .map(documentNode),
  ]

  return childrenOf(null)
}

// Ids of every container above a document, used to reveal it in the tree.
export function pathTo(nodes: TreeNode[], documentId: string): string[] | null {
  for (const node of nodes) {
    if (node.kind === "document" && node.id === documentId) return []
    const below = pathTo(node.children, documentId)
    if (below) return [node.id, ...below]
  }
  return null
}
