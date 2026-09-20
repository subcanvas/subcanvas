import type { Box } from "./shapes"

// What a group takes in when it is dropped over nodes that are already on
// the whiteboard. Kept apart from the canvas so it can be tested as numbers.

// A node and where it is on the whiteboard: absolute, not relative to its
// parent.
export type Placed = Box & {
  id: string
  parentId: string | null
}

export type Adoption = { id: string; parentId: string; x: number; y: number }

const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

// The nodes that lie wholly inside `groupId` and should become its children,
// each with its position converted to be relative to the group.
export function adoptions(groupId: string, placed: Placed[]): Adoption[] {
  const byId = new Map(placed.map((node) => [node.id, node]))
  const group = byId.get(groupId)
  if (!group) return []

  const isWithin = (node: Placed, ancestorId: string) => {
    const seen = new Set<string>()
    let parent = node.parentId ? byId.get(node.parentId) : undefined
    while (parent && !seen.has(parent.id)) {
      if (parent.id === ancestorId) return true
      seen.add(parent.id)
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    return false
  }

  return placed.flatMap((node) => {
    if (node.id === groupId || !contains(group, node)) return []
    // Already inside, at any depth; or the group is inside this node, and
    // taking it in would close a loop.
    if (isWithin(node, groupId) || isWithin(group, node.id)) return []
    // The innermost frame wins: a node stays with a parent that is smaller
    // than the group. When that parent is itself inside the group it is
    // taken in whole, and its children come along.
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent && parent.width * parent.height <= group.width * group.height) return []
    return [{ id: node.id, parentId: groupId, x: node.x - group.x, y: node.y - group.y }]
  })
}
