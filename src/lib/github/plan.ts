import { resolveConnections, type BoardEdge, type Connection } from "./connections"
import { MAX_MAPPED_FOLDERS, type Mapping } from "./mapping"
import { baseName, depthOf, ROOT } from "./paths"
import type { Repository, RepositoryFile } from "./provider"
import { firstParagraph } from "./readme"
import type { SubcanvasFile } from "./subcanvas-file"

// The whiteboards an import will draw, worked out before anything is
// written: which nodes go on which whiteboard, what each one holds, and the
// arrows between them. Ids, positions, and documents come later, in
// import-repository.ts.

export type PlannedNode = {
  key: string
  // A heading with body text, or a box.
  kind: "text" | "plain"
  title: string
  description: string
  // The folder this node stands for. Null for a README node and the heading.
  path: string | null
  holds: { kind: "board"; folder: string } | { kind: "readme"; file: RepositoryFile } | null
}

export type PlannedBoard = {
  // The folder this whiteboard shows the inside of. The root is the top one.
  folder: string
  title: string
  nodes: PlannedNode[]
  edges: BoardEdge[]
}

export type ImportPlan = { boards: PlannedBoard[]; warnings: string[] }

export const TOP_BOARD_TITLE = "System design"
export const HEADING_KEY = "#heading"
const readmeKey = (folder: string) => `${folder}#readme`

const UPPERCASE = new Set([
  "api", "ui", "cli", "sdk", "db", "sql", "http", "grpc", "rpc", "cdn", "ci", "id", "io", "ml", "ai",
  "js", "ts", "css", "html", "url", "sso", "mcp",
])

// "payments-api" reads better on a node as "Payments API".
export function humanize(folderName: string) {
  const words = folderName.split(/[-_.\s]+/).filter(Boolean)
  if (!words.length) return folderName
  return words
    .map((word) =>
      UPPERCASE.has(word.toLowerCase()) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)
    )
    .join(" ")
}

export function planImport({
  repository,
  mapping,
  subcanvasFiles,
  readmes,
}: {
  repository: Repository
  mapping: Mapping
  // Parsed `.subcanvas` files and README text, keyed by folder.
  subcanvasFiles: ReadonlyMap<string, SubcanvasFile>
  readmes: ReadonlyMap<string, string>
}): ImportPlan {
  const mapped = new Set(mapping.folders.map((folder) => folder.path))
  const withChildren = new Set(mapping.folders.map((folder) => folder.parent))

  const connections: Connection[] = [...subcanvasFiles].flatMap(([from, file]) =>
    file.connects.map((connection) => ({ from, ...connection }))
  )
  const { edges, warnings } = resolveConnections(connections, mapped)

  const titleOf = (folder: string) => subcanvasFiles.get(folder)?.title ?? humanize(baseName(folder))

  const root = subcanvasFiles.get(ROOT)
  const boards = new Map<string, PlannedBoard>()
  const board = (folder: string) => {
    let planned = boards.get(folder)
    if (!planned) {
      planned = {
        folder,
        title: folder === ROOT ? (root?.title ?? TOP_BOARD_TITLE) : titleOf(folder),
        nodes: [],
        edges: edges.filter((edge) => edge.board === folder),
      }
      boards.set(folder, planned)
    }
    return planned
  }

  // The top whiteboard opens with what the repository is, in words.
  board(ROOT).nodes.push({
    key: HEADING_KEY,
    kind: "text",
    title: root?.title ?? repository.repository,
    description: root?.description ?? repository.description,
    path: null,
    holds: null,
  })
  if (mapping.rootReadme)
    board(ROOT).nodes.push({
      key: readmeKey(ROOT),
      kind: "plain",
      title: "README",
      description: firstParagraph(readmes.get(ROOT) ?? ""),
      path: null,
      holds: { kind: "readme", file: mapping.rootReadme },
    })

  for (const folder of mapping.folders) {
    const summary = firstParagraph(readmes.get(folder.path) ?? "")
    const opensWhiteboard = withChildren.has(folder.path)

    board(folder.parent).nodes.push({
      key: folder.path,
      kind: "plain",
      title: titleOf(folder.path),
      description: subcanvasFiles.get(folder.path)?.description ?? summary,
      path: folder.path,
      holds: opensWhiteboard
        ? { kind: "board", folder: folder.path }
        : folder.readme && { kind: "readme", file: folder.readme },
    })
    // Its node opens the whiteboard, so the README gets a node of its own
    // on that whiteboard.
    if (opensWhiteboard && folder.readme)
      board(folder.path).nodes.unshift({
        key: readmeKey(folder.path),
        kind: "plain",
        title: "README",
        description: summary,
        path: null,
        holds: { kind: "readme", file: folder.readme },
      })
  }

  if (mapping.capped)
    warnings.push(
      `This repository has more folders than one import draws, so the diagram stops at ${MAX_MAPPED_FOLDERS}. The ones nearest the top were kept.`
    )

  return {
    // A whiteboard is created before the ones inside it.
    boards: [...boards.values()].sort((a, b) => depthOf(a.folder) - depthOf(b.folder)),
    warnings,
  }
}
