"use client"

import "@xyflow/react/dist/style.css"

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react"
import { Group, Redo2, Square, Type, Undo2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { EditorUser } from "@/components/editor/text-editor"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"
import { reconcileLinks } from "@/lib/document-links"
import { documentHref } from "@/lib/navigation"
import { createClient } from "@/lib/supabase/client"
import type { WhiteboardContext } from "@/lib/whiteboard/description-document"
import type { NodeKind, WbEdge, WbNode } from "@/lib/whiteboard/schema"
import {
  useWhiteboard,
  type FlowEdge,
  type FlowNode,
} from "@/lib/whiteboard/use-whiteboard"

import { WhiteboardActionsContext } from "./actions-context"
import { Cursors } from "./cursors"
import { edgeTypes } from "./edge"
import { Inspector } from "./inspector"
import { nodeTypes } from "./nodes"

const PASTE_OFFSET = 24
const FIT_VIEW = { maxZoom: 1, padding: 0.2 }

// Shared by every whiteboard in the tab, so objects can be pasted across them.
let clipboard: { nodes: WbNode[]; edges: WbEdge[] } | null = null

export type WhiteboardProps = {
  provider: SupabaseProvider
  editable: boolean
  context: WhiteboardContext
  user: EditorUser
}

export default function Whiteboard(props: WhiteboardProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

function Canvas({ provider, editable, context, user }: WhiteboardProps) {
  const wb = useWhiteboard(provider.doc, editable)
  const flow = useReactFlow<FlowNode, FlowEdge>()
  const router = useRouter()
  const wrapper = useRef<HTMLDivElement>(null)
  const pasteCount = useRef(0)
  const addCount = useRef(0)
  const [dismissed, setDismissed] = useState<string | null>(null)

  // The panel shows when exactly one object is selected.
  const selection = useMemo(() => {
    const nodes = wb.nodes.filter((node) => node.selected)
    const edges = wb.edges.filter((edge) => edge.selected)
    if (nodes.length + edges.length !== 1) return null
    const picked: { node: WbNode } | { edge: WbEdge } = nodes[0]
      ? { node: nodes[0].data.wb }
      : { edge: edges[0].data!.wb }
    return picked
  }, [wb.nodes, wb.edges])
  const selectedId = selection ? ("node" in selection ? selection.node.id : selection.edge.id) : null

  // Closing the panel lasts until the selection moves off that object.
  const onSelectionChange = useCallback(
    ({ nodes, edges }: { nodes: FlowNode[]; edges: FlowEdge[] }) =>
      setDismissed((current) =>
        current && [...nodes, ...edges].some((item) => item.id === current) ? current : null
      ),
    []
  )

  // Whiteboards and "full page" text documents navigate, extending the
  // breadcrumb trail. A "panel" text document shows in the side panel.
  const openObject = useCallback(
    (objectId: string) => {
      const object =
        wb.nodes.find((node) => node.id === objectId)?.data.wb ??
        wb.edges.find((edge) => edge.id === objectId)?.data?.wb
      if (!object?.docId) return

      if (object.docType === "whiteboard" || object.openMode === "navigate") {
        router.push(
          documentHref({ slug: context.slug, projectId: context.projectId }, object.docId, [
            ...context.via,
            context.whiteboardId,
          ])
        )
        return
      }
      setDismissed(null)
      wb.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: node.id === objectId })))
      wb.setEdges((edges) => edges.map((edge) => ({ ...edge, selected: edge.id === objectId })))
    },
    [wb, router, context]
  )
  const actions = useMemo(() => ({ openObject }), [openObject])

  // Keep the index of references in step with the content (R1.7). Debounced,
  // and keyed on the links alone so moving things around does not trigger it.
  const linkSignature = useMemo(
    () =>
      [...wb.nodes.map((node) => node.data.wb), ...wb.edges.map((edge) => edge.data!.wb)]
        .filter((object) => object.docId)
        .map((object) => `${object.id} ${object.docId}`)
        .sort()
        .join("\n"),
    [wb.nodes, wb.edges]
  )
  useEffect(() => {
    if (!editable) return
    const timer = setTimeout(() => {
      const linked = linkSignature
        ? linkSignature.split("\n").map((line) => {
            const [objectId, docId] = line.split(" ")
            return { objectId, docId }
          })
        : []
      void reconcileLinks(
        createClient(),
        { orgId: context.orgId, documentId: context.whiteboardId },
        linked
      )
    }, 1500)
    return () => clearTimeout(timer)
  }, [editable, linkSignature, context.orgId, context.whiteboardId])

  const selectOnly = useCallback(
    (ids: string[]) => {
      const wanted = new Set(ids)
      // Runs after the Yjs observer has added the new nodes to state.
      queueMicrotask(() =>
        wb.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: wanted.has(node.id) })))
      )
    },
    [wb]
  )

  function add(kind: NodeKind) {
    const box = wrapper.current!.getBoundingClientRect()
    const center = flow.screenToFlowPosition({
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    })
    // Cascade repeated adds so they do not land exactly on top of each other.
    const step = (addCount.current++ % 8) * 24
    selectOnly([wb.addNode(kind, { x: center.x + step, y: center.y + step })])
  }

  // Dropping a node on a group puts it inside; dragging it off takes it out.
  const onNodeDragStop = useCallback(
    (_: unknown, __: FlowNode, dragged: FlowNode[]) => {
      if (!editable) return
      const draggedIds = new Set(dragged.map((node) => node.id))

      const isInside = (candidateId: string, ancestorId: string) => {
        let current = flow.getInternalNode(candidateId)
        while (current?.parentId) {
          if (current.parentId === ancestorId) return true
          current = flow.getInternalNode(current.parentId)
        }
        return false
      }

      for (const node of dragged) {
        // A node moving along with its group keeps its place in it.
        if (node.parentId && draggedIds.has(node.parentId)) continue
        const internal = flow.getInternalNode(node.id)
        if (!internal) continue

        const abs = internal.internals.positionAbsolute
        const center = {
          x: abs.x + (internal.measured.width ?? 0) / 2,
          y: abs.y + (internal.measured.height ?? 0) / 2,
        }

        // The innermost group under the node's center.
        let target: { id: string; x: number; y: number; area: number } | null = null
        for (const other of flow.getNodes()) {
          if (other.type !== "wb-group" || other.id === node.id || isInside(other.id, node.id)) continue
          const group = flow.getInternalNode(other.id)
          if (!group) continue
          const { x, y } = group.internals.positionAbsolute
          const width = group.measured.width ?? 0
          const height = group.measured.height ?? 0
          const contains =
            center.x >= x && center.x <= x + width && center.y >= y && center.y <= y + height
          if (contains && (!target || width * height < target.area))
            target = { id: other.id, x, y, area: width * height }
        }

        if ((target?.id ?? null) === (node.parentId ?? null)) continue
        wb.updateNode(node.id, {
          parentId: target?.id ?? null,
          x: abs.x - (target?.x ?? 0),
          y: abs.y - (target?.y ?? 0),
        })
      }
    },
    [editable, flow, wb]
  )

  function copy() {
    const selected = new Set(wb.nodes.filter((node) => node.selected).map((node) => node.id))
    if (!selected.size) return
    // Bring along everything inside a copied group.
    for (const node of wb.nodes) if (node.parentId && selected.has(node.parentId)) selected.add(node.id)

    clipboard = {
      nodes: wb.nodes.filter((node) => selected.has(node.id)).map((node) => node.data.wb),
      edges: wb.edges
        .filter((edge) => selected.has(edge.source) && selected.has(edge.target))
        .map((edge) => edge.data!.wb),
    }
    pasteCount.current = 0
  }

  function paste() {
    if (!clipboard || !editable) return
    pasteCount.current++
    selectOnly(wb.insertCopies(clipboard.nodes, clipboard.edges, PASTE_OFFSET * pasteCount.current))
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, [contenteditable=true]")) return
    if (!(event.metaKey || event.ctrlKey)) return

    const key = event.key.toLowerCase()
    if (key === "z" && editable) {
      event.preventDefault()
      if (event.shiftKey) wb.redo()
      else wb.undo()
    } else if (key === "y" && editable) {
      event.preventDefault()
      wb.redo()
    } else if (key === "c") copy()
    else if (key === "v") paste()
  }

  return (
    <WhiteboardActionsContext value={actions}>
    <div className="flex size-full" onKeyDown={onKeyDown}>
      <div ref={wrapper} className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={wb.nodes}
          edges={wb.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={wb.onNodesChange}
          onEdgesChange={wb.onEdgesChange}
          onConnect={wb.onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={(_, node) => openObject(node.id)}
          onEdgeDoubleClick={(_, edge) => openObject(edge.id)}
          zoomOnDoubleClick={false}
          onSelectionChange={onSelectionChange}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={editable}
          nodesConnectable={editable}
          edgesReconnectable={false}
          deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
          connectionRadius={24}
          minZoom={0.1}
          maxZoom={3}
          fitView
          fitViewOptions={FIT_VIEW}
          proOptions={{ hideAttribution: false }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} />
          <Controls showInteractive={false} fitViewOptions={FIT_VIEW} />
          <Cursors awareness={provider.awareness} user={user} editable={editable} surface={wrapper} />

          {editable && (
            <Panel position="top-center">
              <div
                role="toolbar"
                aria-label="Whiteboard tools"
                className="flex items-center gap-1 rounded-lg border bg-background p-1 shadow-sm"
              >
                <Tool label="Add node" onClick={() => add("plain")}>
                  <Square />
                </Tool>
                <Tool label="Add text" onClick={() => add("text")}>
                  <Type />
                </Tool>
                <Tool label="Add group" onClick={() => add("group")}>
                  <Group />
                </Tool>
                <Separator orientation="vertical" className="mx-1 h-5" />
                <Tool label="Undo" onClick={wb.undo}>
                  <Undo2 />
                </Tool>
                <Tool label="Redo" onClick={wb.redo}>
                  <Redo2 />
                </Tool>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {selection && selectedId !== dismissed && (
        <Inspector
          selection={selection}
          editable={editable}
          context={context}
          user={user}
          onNodeChange={wb.updateNode}
          onEdgeChange={wb.updateEdge}
          onClose={() => setDismissed(selectedId)}
        />
      )}
    </div>
    </WhiteboardActionsContext>
  )
}

function Tool({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
