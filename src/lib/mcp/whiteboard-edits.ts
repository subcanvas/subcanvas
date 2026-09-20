import type * as Y from "yjs"

import { edgeSides, layoutBoard } from "@/lib/github/layout"
import {
  DEFAULT_SIZE,
  edgesMap,
  nodesMap,
  patchYMap,
  readEdge,
  readNode,
  toYMap,
  type ColorKey,
  type EdgeDirection,
  type EdgeShape,
  type EdgeStroke,
  type NodeKind,
  type WbNode,
} from "@/lib/whiteboard/schema"

import { findFreeSpot, type Box } from "./placement"

// Changes to a whiteboard's Y.Doc, made the way the app's own canvas makes
// them (lib/whiteboard/use-whiteboard.ts): the same fields, the same
// defaults, the same cascade when a node is removed. Each function checks
// everything before it writes anything, so a call that names something
// missing changes nothing.

export type EditResult<T> = T | { error: string }

// A text node has no stored height; it is as tall as its text. This stands
// in for it when looking for free space.
const TEXT_NODE_HEIGHT = 40
const GROUP_PADDING = 40
// Room for the group's title above what it contains.
const GROUP_HEADER = 32

const boxOf = (node: WbNode): Box => ({
  x: node.x,
  y: node.y,
  width: node.width ?? DEFAULT_SIZE[node.kind].width ?? 0,
  height: node.height ?? DEFAULT_SIZE[node.kind].height ?? TEXT_NODE_HEIGHT,
})

const readNodes = (doc: Y.Doc) => [...nodesMap(doc).entries()].map(([id, map]) => readNode(id, map))

const missing = (what: string, ids: string[]) => ({
  error: `No ${what} with id ${ids.join(", ")} on this whiteboard. Read the whiteboard again for current ids.`,
})

// Where a node is on the canvas, given that a node in a group is stored
// relative to the group.
function absolutePosition(node: WbNode, byId: Map<string, WbNode>) {
  let { x, y } = node
  const seen = new Set([node.id])
  let parent = node.parentId ? byId.get(node.parentId) : undefined
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id)
    x += parent.x
    y += parent.y
    parent = parent.parentId ? byId.get(parent.parentId) : undefined
  }
  return { x, y }
}

const placedBox = (node: WbNode, byId: Map<string, WbNode>) => ({
  ...boxOf(node),
  ...absolutePosition(node, byId),
})

const sidesBetween = (source: WbNode, target: WbNode, byId: Map<string, WbNode>) =>
  edgeSides(placedBox(source, byId), placedBox(target, byId))

export type NewNode = {
  kind: NodeKind
  title: string
  description?: string
  color?: ColorKey
  x?: number
  y?: number
  width?: number
  height?: number
  groupId?: string
  nearNodeId?: string
}

export function addNodes(doc: Y.Doc, nodes: NewNode[]): EditResult<{ ids: string[] }> {
  const yNodes = nodesMap(doc)
  const existing = readNodes(doc)
  const byId = new Map(existing.map((node) => [node.id, node]))

  const unknown = nodes.flatMap((node) =>
    [node.groupId, node.nearNodeId].filter((ref): ref is string => !!ref && !byId.has(ref))
  )
  if (unknown.length) return missing("node", unknown)
  const notGroup = nodes.find((node) => node.groupId && byId.get(node.groupId)?.kind !== "group")
  if (notGroup) return { error: `Node ${notGroup.groupId} is not a group.` }

  // Free space is looked for among the nodes that share a parent, since
  // they share a coordinate space. It fills up as the batch is placed.
  const taken = new Map<string | null, Box[]>()
  const siblings = (parentId: string | null) => {
    if (!taken.has(parentId))
      taken.set(parentId, existing.filter((node) => node.parentId === parentId).map(boxOf))
    return taken.get(parentId)!
  }

  const ids: string[] = []
  for (const node of nodes) {
    const id = crypto.randomUUID()
    const size = {
      width: node.width ?? DEFAULT_SIZE[node.kind].width,
      // The canvas sizes a text node to its text, so it stores no height.
      height: node.kind === "text" ? null : (node.height ?? DEFAULT_SIZE[node.kind].height),
    }
    const near = node.nearNodeId ? byId.get(node.nearNodeId)! : undefined
    const parentId = node.groupId ?? near?.parentId ?? null
    const footprint = { width: size.width ?? 0, height: size.height ?? TEXT_NODE_HEIGHT }
    const spot =
      node.x !== undefined && node.y !== undefined
        ? { x: node.x, y: node.y }
        : findFreeSpot(siblings(parentId), footprint, near && boxOf(near))
    siblings(parentId).push({ ...spot, ...footprint })

    yNodes.set(
      id,
      toYMap({
        kind: node.kind,
        ...spot,
        ...size,
        parentId,
        title: node.title,
        description: node.description ?? "",
        color: node.color ?? "default",
      })
    )
    ids.push(id)
  }
  return { ids }
}

export type NodePatch = {
  id: string
  title?: string
  description?: string
  color?: ColorKey
  x?: number
  y?: number
  width?: number
  height?: number
  openMode?: "panel" | "navigate"
}

export function updateNodes(doc: Y.Doc, patches: NodePatch[]): EditResult<{ ids: string[] }> {
  const yNodes = nodesMap(doc)
  const unknown = patches.filter((patch) => !yNodes.has(patch.id)).map((patch) => patch.id)
  if (unknown.length) return missing("node", unknown)

  for (const { id, height, ...patch } of patches) {
    const map = yNodes.get(id)!
    patchYMap(map, patch)
    if (height !== undefined && readNode(id, map).kind !== "text") patchYMap(map, { height })
  }
  return { ids: patches.map((patch) => patch.id) }
}

// Removing a node also removes what is inside it and its edges.
export function deleteNodes(
  doc: Y.Doc,
  ids: string[]
): EditResult<{ nodes: string[]; edges: string[] }> {
  const yNodes = nodesMap(doc)
  const yEdges = edgesMap(doc)
  const unknown = ids.filter((id) => !yNodes.has(id))
  if (unknown.length) return missing("node", unknown)

  const doomed = new Set(ids)
  let grew = true
  while (grew) {
    grew = false
    for (const [id, map] of yNodes)
      if (!doomed.has(id) && doomed.has(map.get("parentId") as string)) {
        doomed.add(id)
        grew = true
      }
  }
  const edges = [...yEdges.entries()]
    .filter(([, map]) => doomed.has(map.get("source") as string) || doomed.has(map.get("target") as string))
    .map(([id]) => id)

  for (const id of doomed) yNodes.delete(id)
  for (const id of edges) yEdges.delete(id)
  return { nodes: [...doomed], edges }
}

export type EdgeStyle = {
  label?: string
  direction?: EdgeDirection
  shape?: EdgeShape
  stroke?: EdgeStroke
  color?: ColorKey
}
export type NewEdge = EdgeStyle & { source: string; target: string }

export function connectNodes(doc: Y.Doc, edges: NewEdge[]): EditResult<{ ids: string[] }> {
  const yNodes = nodesMap(doc)
  const yEdges = edgesMap(doc)
  const unknown = edges.flatMap((edge) => [edge.source, edge.target]).filter((id) => !yNodes.has(id))
  if (unknown.length) return missing("node", [...new Set(unknown)])
  if (edges.some((edge) => edge.source === edge.target))
    return { error: "An arrow cannot join a node to itself." }

  const byId = new Map(readNodes(doc).map((node) => [node.id, node]))
  const ids: string[] = []
  for (const edge of edges) {
    const id = crypto.randomUUID()
    yEdges.set(
      id,
      toYMap({
        source: edge.source,
        target: edge.target,
        // A person drags from one side of a node to a side of another. Here
        // the sides are picked so the arrow takes the short way.
        ...sidesBetween(byId.get(edge.source)!, byId.get(edge.target)!, byId),
        shape: edge.shape ?? "spline",
        stroke: edge.stroke ?? "solid",
        direction: edge.direction ?? "forward",
        color: edge.color ?? "default",
        label: edge.label || null,
      })
    )
    ids.push(id)
  }
  return { ids }
}

export function updateEdges(
  doc: Y.Doc,
  patches: (EdgeStyle & { id: string; openMode?: "panel" | "navigate" })[]
): EditResult<{ ids: string[] }> {
  const yEdges = edgesMap(doc)
  const unknown = patches.filter((patch) => !yEdges.has(patch.id)).map((patch) => patch.id)
  if (unknown.length) return missing("edge", unknown)

  for (const { id, label, ...patch } of patches) {
    const map = yEdges.get(id)!
    patchYMap(map, patch)
    // An empty label is no label.
    if (label !== undefined) patchYMap(map, { label: label || null })
  }
  return { ids: patches.map((patch) => patch.id) }
}

export function deleteEdges(doc: Y.Doc, ids: string[]): EditResult<{ ids: string[] }> {
  const yEdges = edgesMap(doc)
  const unknown = ids.filter((id) => !yEdges.has(id))
  if (unknown.length) return missing("edge", unknown)
  for (const id of ids) yEdges.delete(id)
  return { ids }
}

// Moves nodes into a group, or out of every group when `groupId` is null.
// A node in a group is stored relative to it, so the stored position changes
// and the node stays where it was on the canvas.
export function setGroup(
  doc: Y.Doc,
  nodeIds: string[],
  groupId: string | null
): EditResult<{ ids: string[] }> {
  const yNodes = nodesMap(doc)
  const byId = new Map(readNodes(doc).map((node) => [node.id, node]))
  const unknown = [...nodeIds, ...(groupId ? [groupId] : [])].filter((id) => !byId.has(id))
  if (unknown.length) return missing("node", unknown)

  const group = groupId ? byId.get(groupId)! : null
  if (group && group.kind !== "group") return { error: `Node ${groupId} is not a group.` }
  const inside = (candidate: WbNode, ancestorId: string) => {
    const seen = new Set<string>()
    let current: WbNode | undefined = candidate
    while (current && !seen.has(current.id)) {
      if (current.id === ancestorId) return true
      seen.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return false
  }
  if (group && nodeIds.some((id) => inside(group, id)))
    return { error: "A group cannot be put inside itself or inside something it contains." }

  const origin = group ? absolutePosition(group, byId) : { x: 0, y: 0 }
  for (const id of nodeIds) {
    const at = absolutePosition(byId.get(id)!, byId)
    patchYMap(yNodes.get(id)!, { parentId: groupId, x: at.x - origin.x, y: at.y - origin.y })
  }
  return { ids: nodeIds }
}

// A new group. Given nodes, it is drawn around them and they become its
// members; otherwise it is an empty frame at the given or a free position.
export function createGroup(
  doc: Y.Doc,
  group: { title: string; color?: ColorKey; nodeIds?: string[]; x?: number; y?: number; width?: number; height?: number }
): EditResult<{ id: string }> {
  const members = group.nodeIds ?? []
  if (!members.length) {
    const added = addNodes(doc, [{ kind: "group", ...group }])
    return "error" in added ? added : { id: added.ids[0] }
  }

  const byId = new Map(readNodes(doc).map((node) => [node.id, node]))
  const unknown = members.filter((id) => !byId.has(id))
  if (unknown.length) return missing("node", unknown)
  const parents = new Set(members.map((id) => byId.get(id)!.parentId))
  if (parents.size > 1)
    return { error: "These nodes are in different groups. Group nodes that share a parent." }
  const [parentId] = parents

  // Members share a parent, so their stored positions share a space.
  const boxes = members.map((id) => boxOf(byId.get(id)!))
  const left = Math.min(...boxes.map((box) => box.x)) - GROUP_PADDING
  const top = Math.min(...boxes.map((box) => box.y)) - GROUP_PADDING - GROUP_HEADER
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + GROUP_PADDING
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + GROUP_PADDING

  const id = crypto.randomUUID()
  const yNodes = nodesMap(doc)
  yNodes.set(
    id,
    toYMap({
      kind: "group",
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      parentId,
      title: group.title,
      description: "",
      color: group.color ?? "default",
    })
  )
  for (const member of members) {
    const node = byId.get(member)!
    patchYMap(yNodes.get(member)!, { parentId: id, x: node.x - left, y: node.y - top })
  }
  return { id }
}

// Lays out the nodes that share one parent: the top level of the board, or
// the inside of one group. Nodes joined by arrows flow left to right; the
// rest go in a grid beneath. It is the layout an imported repository gets.
// Every arrow on the board then leaves and enters by the nearest sides.
export function arrangeNodes(doc: Y.Doc, groupId: string | null): EditResult<{ ids: string[] }> {
  const yNodes = nodesMap(doc)
  const yEdges = edgesMap(doc)
  const nodes = readNodes(doc)
  const group = groupId ? nodes.find((node) => node.id === groupId) : null
  if (groupId && group?.kind !== "group") return missing("group", [groupId])

  const members = nodes.filter((node) => node.parentId === groupId)
  const edges = [...yEdges.entries()].map(([id, map]) => readEdge(id, map))
  const positions = layoutBoard(
    members.map((node) => ({ id: node.id, ...boxOf(node) })),
    edges
  )
  // Inside a group, clear of its border and its title.
  const inset = group ? { x: GROUP_PADDING, y: GROUP_PADDING + GROUP_HEADER } : { x: 0, y: 0 }
  for (const [id, position] of positions)
    patchYMap(yNodes.get(id)!, { x: position.x + inset.x, y: position.y + inset.y })

  if (group && members.length) {
    const placed = members.map((node) => ({ ...boxOf(node), ...positions.get(node.id)! }))
    patchYMap(yNodes.get(group.id)!, {
      width: Math.max(...placed.map((box) => box.x + box.width)) + GROUP_PADDING * 2,
      height: Math.max(...placed.map((box) => box.y + box.height)) + GROUP_PADDING * 2 + GROUP_HEADER,
    })
  }

  const moved = new Map(readNodes(doc).map((node) => [node.id, node]))
  for (const edge of edges) {
    const source = moved.get(edge.source)
    const target = moved.get(edge.target)
    if (source && target) patchYMap(yEdges.get(edge.id)!, sidesBetween(source, target, moved))
  }
  return { ids: members.map((node) => node.id) }
}

// Points a node or an edge at the document it holds, or at nothing.
export function setObjectDocument(
  doc: Y.Doc,
  objectId: string,
  held: { docId: string; docType: "text" | "whiteboard" } | null
): EditResult<{ kind: "node" | "edge" }> {
  const node = nodesMap(doc).get(objectId)
  const map = node ?? edgesMap(doc).get(objectId)
  if (!map) return missing("node or edge", [objectId])
  patchYMap(map, { docId: held?.docId ?? null, docType: held?.docType ?? null })
  return { kind: node ? "node" : "edge" }
}

// Every object that holds a document, for the index of references.
export function linkedObjects(doc: Y.Doc) {
  return [
    ...readNodes(doc),
    ...[...edgesMap(doc).entries()].map(([id, map]) => readEdge(id, map)),
  ].flatMap((object) => (object.docId ? [{ objectId: object.id, docId: object.docId }] : []))
}
