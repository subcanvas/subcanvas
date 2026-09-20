"use client"

import {
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as Y from "yjs"

import {
  COLORS,
  DEFAULT_SIZE,
  edgesMap,
  LOCAL_ORIGIN,
  nodesMap,
  patchYMap,
  readEdge,
  readNode,
  toYMap,
  type NodeKind,
  type WbEdge,
  type WbNode,
} from "./schema"

export type FlowNode = Node<{ wb: WbNode }>
export type FlowEdge = Edge<{ wb: WbEdge }>

const DRAG_WRITE_INTERVAL_MS = 40

// React Flow needs a parent before its children.
function parentsFirst(nodes: WbNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const depth = (node: WbNode, seen = new Set<string>()): number => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (!parent || seen.has(node.id)) return 0
    seen.add(node.id)
    return depth(parent, seen) + 1
  }
  return nodes.map((wb) => ({ wb, depth: depth(wb) })).sort((a, b) => a.depth - b.depth)
}

function toFlowNode(wb: WbNode, depth: number, existing: FlowNode | undefined, known: Set<string>): FlowNode {
  // A parent that no longer exists (deleted by someone else) is ignored.
  const parentId = wb.parentId && known.has(wb.parentId) ? wb.parentId : undefined
  return {
    ...existing,
    id: wb.id,
    // Prefixed so React Flow's built-in styles for "group" do not apply.
    type: `wb-${wb.kind}`,
    position: { x: wb.x, y: wb.y },
    parentId,
    width: wb.width ?? undefined,
    height: wb.height ?? undefined,
    // Groups sit behind every node, inner groups over outer ones. Far enough
    // down that React Flow lifting a selected group still leaves it there.
    zIndex: wb.kind === "group" ? depth - 2000 : 0,
    // What a screen reader announces: what it is, what it is called, and
    // whether there is something inside to open.
    ariaLabel: [
      `${wb.kind === "plain" ? "Node" : wb.kind === "text" ? "Text" : "Group"}: ${wb.title || "untitled"}`,
      wb.docType === "whiteboard" ? "holds a whiteboard" : wb.docId ? "holds a document" : "",
    ]
      .filter(Boolean)
      .join(", "),
    data: { wb },
  }
}

function toFlowEdge(
  wb: WbEdge,
  existing: FlowEdge | undefined,
  titleOf: (nodeId: string) => string
): FlowEdge {
  // Default edges are graphite, quieter than the nodes they join.
  const stroke = wb.color === "default" ? "var(--graphite)" : COLORS[wb.color].stroke
  const marker = { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 }
  return {
    ...existing,
    id: wb.id,
    type: "wb",
    source: wb.source,
    target: wb.target,
    sourceHandle: wb.sourceHandle,
    targetHandle: wb.targetHandle,
    markerEnd: wb.direction === "forward" || wb.direction === "both" ? marker : undefined,
    markerStart: wb.direction === "reverse" || wb.direction === "both" ? marker : undefined,
    // Named by what it joins, not by internal ids.
    ariaLabel: [
      `Arrow from ${titleOf(wb.source)} to ${titleOf(wb.target)}`,
      wb.label ? `labelled ${wb.label}` : "",
      wb.docId ? "holds a document" : "",
    ]
      .filter(Boolean)
      .join(", "),
    data: { wb },
  }
}

// Binds a whiteboard Y.Doc to React Flow's controlled nodes and edges.
// Yjs owns the content. React Flow owns what is local to this screen:
// selection, measured sizes, and in-flight drags.
export function useWhiteboard(doc: Y.Doc, editable: boolean) {
  const yNodes = useMemo(() => nodesMap(doc), [doc])
  const yEdges = useMemo(() => edgesMap(doc), [doc])

  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<FlowEdge[]>([])
  const lastDragWrite = useRef(0)

  // Created in an effect, not useMemo: an effect's cleanup destroys it, and
  // React may run cleanup and setup again on the same memoized value.
  const undoManager = useRef<Y.UndoManager | null>(null)
  useEffect(() => {
    const manager = new Y.UndoManager([yNodes, yEdges], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    })
    undoManager.current = manager
    return () => {
      manager.destroy()
      undoManager.current = null
    }
  }, [yNodes, yEdges])

  useEffect(() => {
    const syncNodes = () =>
      setNodes((current) => {
        const existing = new Map(current.map((node) => [node.id, node]))
        const all = [...yNodes.entries()].map(([id, map]) => readNode(id, map))
        const known = new Set(all.map((node) => node.id))
        return parentsFirst(all).map(({ wb, depth }) => toFlowNode(wb, depth, existing.get(wb.id), known))
      })
    const titleOf = (nodeId: string) => (yNodes.get(nodeId)?.get("title") as string) || "untitled"
    const syncEdges = () =>
      setEdges((current) => {
        const existing = new Map(current.map((edge) => [edge.id, edge]))
        return [...yEdges.entries()]
          .map(([id, map]) => readEdge(id, map))
          // An edge whose end was deleted by someone else is not drawn.
          .filter((wb) => yNodes.has(wb.source) && yNodes.has(wb.target))
          .map((wb) => toFlowEdge(wb, existing.get(wb.id), titleOf))
      })
    const syncAll = () => {
      syncNodes()
      syncEdges()
    }

    syncAll()
    yNodes.observeDeep(syncAll)
    yEdges.observeDeep(syncEdges)
    return () => {
      yNodes.unobserveDeep(syncAll)
      yEdges.unobserveDeep(syncEdges)
    }
  }, [yNodes, yEdges])

  const transact = useCallback(
    (fn: () => void) => {
      if (editable) doc.transact(fn, LOCAL_ORIGIN)
    },
    [doc, editable]
  )

  // Removing a node also removes what is inside it and its edges.
  const removeNodes = useCallback(
    (ids: string[]) => {
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
      transact(() => {
        for (const id of doomed) yNodes.delete(id)
        for (const [id, map] of yEdges)
          if (doomed.has(map.get("source") as string) || doomed.has(map.get("target") as string))
            yEdges.delete(id)
      })
    },
    [transact, yNodes, yEdges]
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      // Local-only state (selection, measurements, the drag in progress).
      setNodes((current) =>
        applyNodeChanges(
          changes.filter((change) => change.type !== "remove"),
          current
        )
      )
      if (!editable) return

      const removed = changes.flatMap((change) => (change.type === "remove" ? [change.id] : []))
      if (removed.length) removeNodes(removed)

      const now = Date.now()
      const dragging = changes.some((change) => change.type === "position" && change.dragging)
      const writeDrag = !dragging || now - lastDragWrite.current >= DRAG_WRITE_INTERVAL_MS
      if (dragging && writeDrag) lastDragWrite.current = now

      transact(() => {
        for (const change of changes) {
          const map = "id" in change ? yNodes.get(change.id) : undefined
          if (!map) continue
          if (change.type === "position" && change.position && writeDrag)
            patchYMap(map, { x: change.position.x, y: change.position.y })
          // Only a resize by the user is content. Measurements are not.
          if (change.type === "dimensions" && change.resizing !== undefined && change.dimensions)
            patchYMap(map, {
              width: change.dimensions.width,
              height: readNode(change.id, map).kind === "text" ? null : change.dimensions.height,
            })
        }
      })
    },
    [editable, removeNodes, transact, yNodes]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      setEdges((current) =>
        applyEdgeChanges(
          changes.filter((change) => change.type !== "remove"),
          current
        )
      )
      const removed = changes.flatMap((change) => (change.type === "remove" ? [change.id] : []))
      if (removed.length) transact(() => removed.forEach((id) => yEdges.delete(id)))
    },
    [transact, yEdges]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return
      transact(() =>
        yEdges.set(
          crypto.randomUUID(),
          toYMap({
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
            shape: "spline",
            stroke: "solid",
            direction: "forward",
            color: "default",
          })
        )
      )
    },
    [transact, yEdges]
  )

  const addNode = useCallback(
    (kind: NodeKind, center: { x: number; y: number }) => {
      const id = crypto.randomUUID()
      const size = DEFAULT_SIZE[kind]
      transact(() =>
        yNodes.set(
          id,
          toYMap({
            kind,
            x: center.x - (size.width ?? 0) / 2,
            y: center.y - (size.height ?? 40) / 2,
            width: size.width,
            height: size.height,
            title: kind === "group" ? "Group" : kind === "text" ? "Heading" : "Node",
            description: "",
            color: "default",
          })
        )
      )
      return id
    },
    [transact, yNodes]
  )

  const updateNode = useCallback(
    (id: string, patch: Partial<Omit<WbNode, "id">>) => {
      const map = yNodes.get(id)
      if (map) transact(() => patchYMap(map, patch))
    },
    [transact, yNodes]
  )

  // Several nodes changed as one step: one transaction, so one undo.
  const updateNodes = useCallback(
    (patches: { id: string; patch: Partial<Omit<WbNode, "id">> }[]) =>
      transact(() => {
        for (const { id, patch } of patches) {
          const map = yNodes.get(id)
          if (map) patchYMap(map, patch)
        }
      }),
    [transact, yNodes]
  )

  const updateEdge = useCallback(
    (id: string, patch: Partial<Omit<WbEdge, "id">>) => {
      const map = yEdges.get(id)
      if (map) transact(() => patchYMap(map, patch))
    },
    [transact, yEdges]
  )

  // Inserts copies with fresh ids. Parents and edge ends inside the copied
  // set are remapped; anything pointing outside it is dropped.
  const insertCopies = useCallback(
    (copiedNodes: WbNode[], copiedEdges: WbEdge[], offset: number) => {
      const ids = new Map(copiedNodes.map((node) => [node.id, crypto.randomUUID()]))
      transact(() => {
        for (const node of copiedNodes) {
          const { id, ...fields } = node
          const inside = node.parentId !== null && ids.has(node.parentId)
          yNodes.set(
            ids.get(id)!,
            toYMap({
              ...fields,
              // Links are not duplicated: a document has one home (R1.4).
              docId: null,
              docType: null,
              // Keep a parent outside the copied set, so a copy stays in its group.
              parentId: inside ? ids.get(node.parentId!) : node.parentId,
              x: inside ? node.x : node.x + offset,
              y: inside ? node.y : node.y + offset,
            })
          )
        }
        for (const edge of copiedEdges) {
          const source = ids.get(edge.source)
          const target = ids.get(edge.target)
          if (!source || !target) continue
          yEdges.set(
            crypto.randomUUID(),
            toYMap({ ...edge, id: null, docId: null, docType: null, source, target })
          )
        }
      })
      return [...ids.values()]
    },
    [transact, yNodes, yEdges]
  )

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNode,
    updateNodes,
    updateEdge,
    removeNodes,
    insertCopies,
    undo: () => undoManager.current?.undo(),
    redo: () => undoManager.current?.redo(),
  }
}
