import { isInside, parentPath, ROOT, selfAndAncestors } from "./paths"
import { SUBCANVAS_FILE_NAME } from "./subcanvas-file"

// A connection as a `.subcanvas` file declares it: from the file's folder to
// a path anywhere in the repository.
export type Connection = { from: string; to: string; label: string; description: string }

// The same connection as an arrow that can be drawn: between two nodes that
// sit on one whiteboard. `board` is the folder that whiteboard belongs to.
export type BoardEdge = {
  board: string
  source: string
  target: string
  label: string
  description: string
}

// An arrow joins two nodes on the same whiteboard, but two folders that talk
// to each other are often on different ones: services/payments and
// apps/web meet only at the top, as `services` and `apps`. So each end is
// lifted to its ancestor on the whiteboard where the two paths part, which
// keeps a cross-service link visible at the level where it can be shown.
// Several connections can lift to the same pair; one arrow is drawn, and it
// keeps the first label and description it was given.
export function resolveConnections(
  connections: Connection[],
  mapped: ReadonlySet<string>
): { edges: BoardEdge[]; warnings: string[] } {
  const edges = new Map<string, BoardEdge>()
  const warnings: string[] = []

  for (const connection of connections) {
    const where = `${connection.from ? `${connection.from}/` : ""}${SUBCANVAS_FILE_NAME}`
    if (connection.from === ROOT) {
      warnings.push(`${where}: the repository itself is not a node, so \`connects\` was ignored here.`)
      continue
    }

    // A target deeper than the diagram goes is drawn to the nearest folder
    // that is on it. When that folder is one the source is inside, the
    // target is simply not there: services/typo is not "services".
    const target = selfAndAncestors(connection.to).find((path) => mapped.has(path))
    const missing = !target || (target !== connection.to && isInside(connection.from, target))
    if (missing || !mapped.has(connection.from)) {
      warnings.push(`${where}: \`to: ${connection.to}\` is not a folder on the diagram.`)
      continue
    }

    const from = selfAndAncestors(connection.from).reverse()
    const to = selfAndAncestors(target).reverse()
    const fork = from.findIndex((path, index) => path !== to[index])
    if (fork === -1 || fork >= to.length) {
      warnings.push(`${where}: \`to: ${connection.to}\` is this folder, or contains it, or is inside it.`)
      continue
    }

    const key = `${from[fork]}\n${to[fork]}`
    const existing = edges.get(key)
    if (existing) {
      existing.label ||= connection.label
      existing.description ||= connection.description
    } else
      edges.set(key, {
        board: parentPath(from[fork]),
        source: from[fork],
        target: to[fork],
        label: connection.label,
        description: connection.description,
      })
  }

  return { edges: [...edges.values()], warnings }
}
