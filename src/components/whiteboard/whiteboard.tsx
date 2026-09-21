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
  SelectionMode,
  useReactFlow,
  useStoreApi,
} from "@xyflow/react"
import { Copy, Group, ImagePlus, LayoutGrid, Redo2, Square, Trash2, Type, Undo2 } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import type { EditorUser } from "@/components/editor/text-editor"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"
import { reconcileLinks } from "@/lib/document-links"
import { documentHref } from "@/lib/navigation"
import { createClient } from "@/lib/supabase/client"
import { adoptions } from "@/lib/whiteboard/adopt"
import { arrange } from "@/lib/whiteboard/arrange"
import { collectClip, placeClip, type Clip } from "@/lib/whiteboard/clipboard"
import type { WhiteboardContext } from "@/lib/whiteboard/description-document"
import { MEDIA_ACCEPT, mediaDocumentId } from "@/lib/whiteboard/media"
import { copyMediaTo } from "@/lib/whiteboard/media-upload"
import type { NodeKind, WbEdge, WbNode } from "@/lib/whiteboard/schema"
import {
  useWhiteboard,
  type FlowEdge,
  type FlowNode,
} from "@/lib/whiteboard/use-whiteboard"

import { WhiteboardActionsContext } from "./actions-context"
import { Cursors } from "./cursors"
import { edgeTypes } from "./edge"
import { HintBar, isModKey, KEYS, type HintState } from "./hint-bar"
import { Inspector } from "./inspector"
import { ModeToggle, storedMode, storeMode, type Mode } from "./mode-toggle"
import { nodeTypes } from "./nodes"
import { PanelResizer, usePanelWidth } from "./panel-resizer"
import { useMediaUploads } from "./use-media-uploads"

const PASTE_OFFSET = 24
const NUDGE = 5
const BIG_NUDGE = 20
const FIT_VIEW = { maxZoom: 1, padding: 0.2 }
// Middle and right mouse buttons. The left one draws a selection.
const PAN_BUTTONS = [1, 2]

// Where typing belongs to the text, not to the canvas.
const TYPING = "input, textarea, select, [contenteditable=true], [role=dialog], [role=menu], [role=listbox]"
// Controls that use Enter, Space and the arrow keys themselves. A video that
// has the focus seeks with the arrows.
const OWN_KEYS = "button, a, video, [role=separator], [role=radio]"

// Shared by every whiteboard in the tab, so objects can be pasted across them.
let clipboard: Clip | null = null

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
  // View mode is a choice made by someone who may edit, so that a stray
  // finger changes nothing. Someone who may not edit is always in it.
  const [mode, setMode] = useState<Mode>(storedMode)
  const canEdit = editable && mode === "edit"

  const wb = useWhiteboard(provider.doc, canEdit)
  const flow = useReactFlow<FlowNode, FlowEdge>()
  const store = useStoreApi()
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const root = useRef<HTMLDivElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  // Where the pointer is while it is over the canvas, for paste.
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const pasteCount = useRef(0)
  const addCount = useRef(0)
  const filePicker = useRef<HTMLInputElement>(null)
  // True while files are being dragged over the canvas.
  const [dropping, setDropping] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const panel = usePanelWidth(root)

  function changeMode(next: Mode) {
    setMode(next)
    storeMode(next)
  }

  const selectedNodes = useMemo(() => wb.nodes.filter((node) => node.selected), [wb.nodes])
  const selectedEdges = useMemo(() => wb.edges.filter((edge) => edge.selected), [wb.edges])

  // The panel shows when exactly one object is selected.
  const selection = useMemo(() => {
    if (selectedNodes.length + selectedEdges.length !== 1) return null
    const picked: { node: WbNode } | { edge: WbEdge } = selectedNodes[0]
      ? { node: selectedNodes[0].data.wb }
      : { edge: selectedEdges[0].data!.wb }
    return picked
  }, [selectedNodes, selectedEdges])
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

  // The middle of the canvas as it is on screen, for what the toolbar adds.
  function nextSpot() {
    const box = wrapper.current!.getBoundingClientRect()
    const center = flow.screenToFlowPosition({
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    })
    // Cascade repeated adds so they do not land exactly on top of each other.
    const step = (addCount.current++ % 8) * 24
    return { x: center.x + step, y: center.y + step }
  }

  function add(kind: NodeKind) {
    selectOnly([wb.addNode(kind, nextSpot())])
  }

  // The innermost group under a point, leaving out the ones `skip` names and
  // any no larger than `largerThan`.
  const groupAt = useCallback(
    (point: { x: number; y: number }, skip: (groupId: string) => boolean, largerThan = 0) => {
      let found: { id: string; x: number; y: number; area: number } | null = null
      for (const other of flow.getNodes()) {
        if (other.type !== "wb-group" || skip(other.id)) continue
        const group = flow.getInternalNode(other.id)
        if (!group) continue
        const { x, y } = group.internals.positionAbsolute
        const width = group.measured.width ?? 0
        const height = group.measured.height ?? 0
        const contains =
          width * height > largerThan &&
          point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height
        if (contains && (!found || width * height < found.area))
          found = { id: other.id, x, y, area: width * height }
      }
      return found
    },
    [flow]
  )

  const mediaHome = useMemo(
    () => ({ orgId: context.orgId, projectId: context.projectId, documentId: context.whiteboardId }),
    [context.orgId, context.projectId, context.whiteboardId]
  )
  // A picture that lands on a group goes inside it.
  const settleInGroup = useCallback(
    (node: WbNode) => {
      const group = groupAt({ x: node.x + (node.width ?? 0) / 2, y: node.y + (node.height ?? 0) / 2 }, () => false)
      return group ? { ...node, parentId: group.id, x: node.x - group.x, y: node.y - group.y } : node
    },
    [groupAt]
  )
  const uploadFiles = useMediaUploads({ wb, home: mediaHome, settle: settleInGroup, onAdded: selectOnly })

  // Files from the toolbar, a drop or a paste. `at` is where on the screen
  // they were dropped; without one they go to the middle of the canvas.
  function addFiles(files: File[], at: { x: number; y: number } | null) {
    if (!files.length) return
    if (!canEdit) {
      if (editable) toast.message("Switch to edit mode to add pictures and videos.")
      return
    }
    void uploadFiles(files, at ? flow.screenToFlowPosition(at) : nextSpot())
  }

  // Dropping a node on a group puts it inside; dragging it off takes it out.
  const onNodeDragStop = useCallback(
    (_: unknown, __: FlowNode, dragged: FlowNode[]) => {
      if (!canEdit) return
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
        // A group cannot go inside itself, or inside what it holds, and only
        // goes into something larger: a group dropped over a smaller one
        // takes it in (below), it does not go inside it.
        const area = (internal.measured.width ?? 0) * (internal.measured.height ?? 0)
        const target = groupAt(center, (id) => id === node.id || isInside(id, node.id), area)

        if ((target?.id ?? null) === (node.parentId ?? null)) continue
        wb.updateNode(node.id, {
          parentId: target?.id ?? null,
          x: abs.x - (target?.x ?? 0),
          y: abs.y - (target?.y ?? 0),
        })
      }

      // The other way round: a group dropped over nodes takes in the ones
      // that lie wholly inside it.
      const placed = flow.getNodes().flatMap((node) => {
        const internal = flow.getInternalNode(node.id)
        if (!internal) return []
        const { x, y } = internal.internals.positionAbsolute
        const { width = 0, height = 0 } = internal.measured
        return [{ id: node.id, parentId: node.parentId ?? null, x, y, width, height }]
      })
      wb.updateNodes(
        dragged
          .filter((node) => node.type === "wb-group")
          .flatMap((group) => adoptions(group.id, placed))
          // A node dragged along with the group was placed by the loop above.
          .filter((adoption) => !draggedIds.has(adoption.id))
          .map(({ id, ...patch }) => ({ id, patch }))
      )
    },
    [canEdit, flow, groupAt, wb]
  )

  // The selected nodes, with their real place and size on the canvas.
  function clipOfSelection() {
    const sources = wb.nodes.flatMap((node) => {
      const internal = flow.getInternalNode(node.id)
      if (!internal) return []
      return {
        wb: node.data.wb,
        absolute: internal.internals.positionAbsolute,
        width: internal.measured.width ?? 0,
        height: internal.measured.height ?? 0,
      }
    })
    return collectClip(
      sources,
      wb.edges.map((edge) => edge.data!.wb),
      selectedNodes.map((node) => node.id)
    )
  }

  function insert(clip: Clip, delta: { x: number; y: number }, underPointer: boolean) {
    const placed = placeClip(clip, delta, (node, absolute) => {
      // Pasted somewhere else, a copy joins whatever group it lands on.
      if (underPointer)
        return groupAt(
          { x: absolute.x + (node.width ?? 0) / 2, y: absolute.y + (node.height ?? 0) / 2 },
          () => false
        )
      // Beside the original, it stays in the original's group.
      const parent = node.parentId ? flow.getInternalNode(node.parentId) : undefined
      return parent ? { id: parent.id, ...parent.internals.positionAbsolute } : null
    })
    selectOnly(wb.insertCopies(placed, clip.edges))
  }

  function copy() {
    const clip = clipOfSelection()
    if (!clip) return
    clipboard = clip
    pasteCount.current = 0
    // Best effort: the whiteboard pastes from its own clipboard, this is for
    // pasting into anything else. A browser that refuses is not an error.
    navigator.clipboard?.writeText(clip.text).catch(() => {})
  }

  // Pictures copied on another whiteboard get files of their own on this
  // one first (media-upload.ts). One that cannot be copied is left out.
  async function withMediaHere(clip: Clip): Promise<Clip> {
    let full: string | null = null
    const nodes = await Promise.all(
      clip.nodes.map(async (node) => {
        if (!node.mediaPath || mediaDocumentId(node.mediaPath) === context.whiteboardId) return node
        const mediaPath = await copyMediaTo(mediaHome, node.mediaPath)
        if (typeof mediaPath === "string") return { ...node, mediaPath }
        if (mediaPath) full = mediaPath.full
        return null
      })
    )
    const kept = nodes.filter((node) => node !== null)
    if (full) toast.error(`Pictures and videos were left out. ${full}`)
    else if (kept.length < nodes.length) toast.error("A picture or video could not be copied to this whiteboard.")
    return { ...clip, nodes: kept }
  }

  async function paste() {
    if (!clipboard || !canEdit) return
    // Each paste steps further, so repeated pastes do not pile up.
    const step = PASTE_OFFSET * pasteCount.current++
    const at = pointer.current && flow.screenToFlowPosition(pointer.current)
    const clip = await withMediaHere(clipboard)
    if (!clip.nodes.length) return
    const { bounds } = clip
    const toPointer = at && {
      x: at.x - (bounds.x + bounds.width / 2) + step,
      y: at.y - (bounds.y + bounds.height / 2) + step,
    }
    // Under the pointer when it is over the canvas. With the pointer still on
    // the original, that would hide the copy behind it, so it goes beside.
    if (toPointer && Math.hypot(toPointer.x, toPointer.y) >= PASTE_OFFSET) insert(clip, toPointer, true)
    else insert(clip, { x: step + PASTE_OFFSET, y: step + PASTE_OFFSET }, false)
  }

  function cut() {
    if (!canEdit) return
    copy()
    removeSelection()
  }

  function duplicate() {
    const clip = canEdit && clipOfSelection()
    if (clip) insert(clip, { x: PASTE_OFFSET, y: PASTE_OFFSET }, false)
  }

  function removeSelection() {
    if (!canEdit || selectedNodes.length + selectedEdges.length === 0) return
    wb.removeObjects(
      selectedNodes.map((node) => node.id),
      selectedEdges.map((edge) => edge.id)
    )
    store.setState({ nodesSelectionActive: false })
  }

  function select(all: boolean) {
    wb.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: all })))
    wb.setEdges((edges) => edges.map((edge) => ({ ...edge, selected: all })))
    store.setState({ nodesSelectionActive: false })
  }

  function nudge(dx: number, dy: number) {
    const selected = new Set(selectedNodes.map((node) => node.id))
    // A node inside a selected group moves with the group, not twice.
    const moving = selectedNodes.filter((node) => !node.parentId || !selected.has(node.parentId))
    wb.moveNodes(
      moving.map((node) => node.id),
      dx,
      dy
    )
  }

  function arrangeSelection() {
    if (!canEdit || selectedNodes.length < 2) return
    const nodes = wb.nodes.flatMap((node) => {
      const internal = flow.getInternalNode(node.id)
      if (!internal) return []
      const { x, y, parentId } = node.data.wb
      // The size on screen: a text node's height is never stored.
      return { id: node.id, x, y, parentId, width: internal.measured.width ?? 0, height: internal.measured.height ?? 0 }
    })
    wb.applyArrangement(
      arrange(
        nodes,
        wb.edges.map((edge) => edge.data!.wb),
        selectedNodes.map((node) => node.id)
      )
    )
  }

  // Enter goes into the selected object: to what it holds, or else to its
  // name in the panel.
  function enterSelection() {
    if (!selection) return
    const object = "node" in selection ? selection.node : selection.edge
    if (object.docId) return openObject(object.id)
    setDismissed(null)
    if (!canEdit) return
    // After the panel has rendered, if it was closed.
    requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>("#wb-title, #wb-label")?.select())
  }

  // On the window, because a click on the empty canvas leaves focus on the
  // page body, where a handler on the canvas would never hear a key.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (event.defaultPrevented || target.closest(TYPING)) return
    if (target !== document.body && !root.current?.contains(target)) return

    const key = event.key.toLowerCase()
    const run = (action: () => void) => {
      event.preventDefault()
      action()
    }

    if (isModKey(event)) {
      // Selected text (a title in the panel, say) is what copy means then.
      const textSelected = !!window.getSelection()?.toString()
      if (key === "z") run(event.shiftKey ? wb.redo : wb.undo)
      else if (key === "y") run(wb.redo)
      else if (key === "c" && !textSelected) run(copy)
      else if (key === "x" && !textSelected) run(cut)
      else if (key === "d") run(duplicate)
      else if (key === "a") run(() => select(true))
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return

    // Only when there is a selection to clear: Escape has other jobs too.
    if (key === "escape" && selectedNodes.length + selectedEdges.length) run(() => select(false))
    else if (key === "escape") return
    else if (key === "e" && editable) run(() => changeMode(mode === "edit" ? "view" : "edit"))
    else if (key === "a" && event.shiftKey) run(arrangeSelection)
    else if (key === "backspace" || key === "delete") run(removeSelection)
    else if (target.closest(OWN_KEYS)) return
    else if (key === "enter") run(enterSelection)
    else if (key.startsWith("arrow") && canEdit && selectedNodes.length) {
      const step = event.shiftKey ? BIG_NUDGE : NUDGE
      run(() =>
        nudge(
          key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
          key === "arrowup" ? -step : key === "arrowdown" ? step : 0
        )
      )
    }
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  // Paste is heard as the browser's own event, not as a key: only that event
  // carries what is on the system clipboard. A picture copied anywhere (a
  // screenshot, an image on a web page) becomes a media node; otherwise paste
  // means the nodes last copied here.
  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const target = event.target as HTMLElement
    if (event.defaultPrevented || target.closest(TYPING)) return
    if (target !== document.body && !root.current?.contains(target)) return
    event.preventDefault()
    const files = [...(event.clipboardData?.files ?? [])]
    if (files.length) addFiles(files, pointer.current)
    else void paste()
  })
  useEffect(() => {
    const listener = (event: ClipboardEvent) => onPaste(event)
    window.addEventListener("paste", listener)
    return () => window.removeEventListener("paste", listener)
  }, [])

  // A trackpad pinch arrives as a wheel event with Ctrl held. The canvas
  // zooms on it; anywhere else on the whiteboard (the toolbar, the panel) it
  // would zoom the whole page, which is never what the pinch was for.
  useEffect(() => {
    const element = root.current
    if (!element) return
    const listener = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault()
    }
    element.addEventListener("wheel", listener, { passive: false })
    return () => element.removeEventListener("wheel", listener)
  }, [])

  const hints: HintState = canEdit
    ? { looking: false, nodes: selectedNodes.length, edges: selectedEdges.length }
    : { looking: true, canSwitchToEdit: editable }

  return (
    <WhiteboardActionsContext value={actions}>
    <div
      ref={root}
      className="relative flex size-full"
      style={{ ["--panel-width" as string]: `${panel.width}px` }}
    >
      <div
        ref={wrapper}
        className="@container relative min-w-0 flex-1 bg-paper"
        onPointerMove={(event) => (pointer.current = { x: event.clientX, y: event.clientY })}
        onPointerLeave={() => (pointer.current = null)}
        // Files dragged in from the desktop. Always taken, even when they
        // cannot be added: a browser left to itself would open the file in
        // place of the whiteboard.
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return
          event.preventDefault()
          event.dataTransfer.dropEffect = canEdit ? "copy" : "none"
          setDropping(canEdit)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false)
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return
          event.preventDefault()
          setDropping(false)
          addFiles([...event.dataTransfer.files], { x: event.clientX, y: event.clientY })
        }}
      >
        {dropping && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-2 z-10 rounded-xl border-2 border-dashed border-cobalt bg-cobalt/5"
          />
        )}
        {/* Navigation is a drawing tool's: two fingers (or the wheel) pan, a
            pinch or the command key with the wheel zooms, and a drag on the
            empty canvas selects. Holding Space, or the middle or right
            button, drags the canvas. A finger on a touch screen pans. */}
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
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          connectionMode={ConnectionMode.Loose}
          panOnScroll
          panOnDrag={PAN_BUTTONS}
          selectionOnDrag
          // Touching a node with the rectangle is enough to select it.
          selectionMode={SelectionMode.Partial}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          edgesReconnectable={false}
          // Deleting is done here, so that nodes and arrows go in one step.
          deleteKeyCode={null}
          connectionRadius={24}
          minZoom={0.1}
          maxZoom={3}
          fitView
          fitViewOptions={FIT_VIEW}
          // Allowed by React Flow's MIT license. The README credits it.
          proOptions={{ hideAttribution: true }}
          data-locked={canEdit ? undefined : ""}
        >
          {/* Drafting paper: a non-photo blue grid that never competes with the ink. */}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--blueline)" bgColor="var(--paper)" />
          <Controls showInteractive={false} fitViewOptions={FIT_VIEW} />
          <Cursors awareness={provider.awareness} user={user} editable={editable} surface={wrapper} />

          {editable && (
            // Beside the tools on a wide canvas, under them on a narrow one.
            <Panel position="top-right" className="@max-lg:top-14!">
              <div className="rounded-xl border border-rule bg-sheet p-1 shadow-sm">
                <ModeToggle mode={mode} onChange={changeMode} />
              </div>
            </Panel>
          )}

          {canEdit && (
            <Panel position="top-center">
              <div
                role="toolbar"
                aria-label="Whiteboard tools"
                className="flex items-center gap-0.5 rounded-xl border border-rule bg-sheet p-1 shadow-sm"
              >
                <Tool label="Node" hint="A box with a title" onClick={() => add("plain")}>
                  <Square />
                </Tool>
                <Tool label="Text" hint="A heading and a paragraph, no box" onClick={() => add("text")}>
                  <Type />
                </Tool>
                <Tool label="Group" hint="A frame that moves what is inside it" onClick={() => add("group")}>
                  <Group />
                </Tool>
                <Tool
                  label="Media"
                  hint="A picture or a video. Files can also be dropped on the canvas, or pasted"
                  onClick={() => filePicker.current?.click()}
                >
                  <ImagePlus />
                </Tool>
                <input
                  ref={filePicker}
                  type="file"
                  multiple
                  accept={MEDIA_ACCEPT}
                  // The button above is the control; this only opens the dialog.
                  hidden
                  onChange={(event) => {
                    addFiles([...(event.target.files ?? [])], null)
                    // So that choosing the same file again is a change.
                    event.target.value = ""
                  }}
                />
                <Separator orientation="vertical" className="mx-1 h-5" />
                <Tool label="Undo" hint={`Undo ${KEYS.mod}Z`} iconOnly onClick={wb.undo}>
                  <Undo2 />
                </Tool>
                <Tool label="Redo" hint={`Redo ${KEYS.shift}${KEYS.mod}Z`} iconOnly onClick={wb.redo}>
                  <Redo2 />
                </Tool>
              </div>
            </Panel>
          )}

          {wb.nodes.length === 0 ? (
            <Panel position="top-center" className="!top-1/2 !-translate-y-1/2">
              <div className="flex max-w-sm flex-col items-center gap-2 text-center">
                <p className="font-heading text-xl font-semibold">An empty sheet</p>
                <p className="text-sm text-graphite">
                  {canEdit
                    ? "Add a node to begin. Anything you add can hold a description, or a whole whiteboard of its own."
                    : "Nothing has been added here yet."}
                </p>
              </div>
            </Panel>
          ) : (
            <Panel position="bottom-center" className="flex flex-col items-center gap-2">
              {canEdit && selectedNodes.length > 1 && (
                <div
                  role="toolbar"
                  aria-label="Selected nodes"
                  className="flex items-center gap-0.5 rounded-xl border border-rule bg-sheet p-1 shadow-sm"
                >
                  <span className="px-2 text-xs text-graphite tabular-nums">{selectedNodes.length} selected</span>
                  <Separator orientation="vertical" className="mx-1 h-5" />
                  <Tool
                    label="Arrange"
                    hint={`Lay them out so nothing overlaps and every label shows ${KEYS.shift}A`}
                    onClick={arrangeSelection}
                  >
                    <LayoutGrid />
                  </Tool>
                  <Tool label="Duplicate" hint={`Duplicate ${KEYS.mod}D`} iconOnly onClick={duplicate}>
                    <Copy />
                  </Tool>
                  <Tool label="Delete" hint={`Delete ${KEYS.remove}`} iconOnly destructive onClick={removeSelection}>
                    <Trash2 />
                  </Tool>
                </div>
              )}
              <HintBar state={hints} />
            </Panel>
          )}
        </ReactFlow>
      </div>

      {selection && selectedId !== dismissed && (
        <>
          <PanelResizer area={root} {...panel} />
          <Inspector
            selection={selection}
            editable={canEdit}
            locked={editable && !canEdit}
            context={context}
            user={user}
            onNodeChange={wb.updateNode}
            onEdgeChange={wb.updateEdge}
            onClose={() => setDismissed(selectedId)}
          />
        </>
      )}
    </div>
    </WhiteboardActionsContext>
  )
}

function Tool({
  label,
  hint,
  iconOnly = false,
  destructive = false,
  onClick,
  children,
}: {
  label: string
  hint?: string
  iconOnly?: boolean
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={iconOnly ? "icon" : "default"}
            aria-label={iconOnly ? label : undefined}
            className={destructive ? "text-ink hover:bg-destructive/10 hover:text-destructive" : "text-ink"}
            onClick={onClick}
          >
            {children}
            {!iconOnly && label}
          </Button>
        }
      />
      <TooltipContent>{hint ?? label}</TooltipContent>
    </Tooltip>
  )
}
