"use client"

import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react"
import { FileText, Workflow } from "lucide-react"

import { COLORS, type DocType, type WbNode } from "@/lib/whiteboard/schema"
import type { FlowNode } from "@/lib/whiteboard/use-whiteboard"
import { cn } from "@/lib/utils"

import { useWhiteboardActions } from "./actions-context"

// One handle per side. The canvas runs in loose connection mode, so every
// handle can start or end an edge.
function Handles({ visible }: { visible: boolean }) {
  return (
    <>
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={Position[(side[0].toUpperCase() + side.slice(1)) as keyof typeof Position]}
          className={cn(
            "!size-2.5 !rounded-full !border-2 !border-sheet !bg-cobalt transition-opacity",
            visible ? "opacity-100" : "opacity-0 group-hover/node:opacity-100"
          )}
        />
      ))}
    </>
  )
}

function Resizer({ selected, minWidth, minHeight }: { selected: boolean; minWidth: number; minHeight: number }) {
  return (
    <NodeResizer
      isVisible={selected}
      minWidth={minWidth}
      minHeight={minHeight}
      lineClassName="!border-cobalt/60"
      handleClassName="!size-2 !rounded-[2px] !border-cobalt !bg-sheet"
    />
  )
}

// What an object holds, and the way in (R4.7, R4.9).
export function DocumentMark({
  objectId,
  docType,
  className,
}: {
  objectId: string
  docType: DocType | null
  className?: string
}) {
  const { openObject } = useWhiteboardActions()
  const Icon = docType === "whiteboard" ? Workflow : FileText
  const label = docType === "whiteboard" ? "Open the whiteboard inside" : "Open the document inside"
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => openObject(objectId)}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        "nodrag nopan pointer-events-auto flex size-5 items-center justify-center rounded-[5px] border border-rule bg-sheet text-graphite outline-none transition-colors hover:border-cobalt hover:text-cobalt focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Icon className="size-3" />
    </button>
  )
}

// The signature. An object that holds a whiteboard is drawn as a stack of
// sheets, because there are more sheets inside it. A description is a note
// on the same sheet, so it gets the mark without the stack.
const stackFor = (wb: WbNode) => (wb.docType === "whiteboard" ? "sheet-stack" : "shadow-xs")

export function PlainNode({ data, selected }: NodeProps<FlowNode>) {
  const { wb } = data
  const color = COLORS[wb.color]
  return (
    <div
      className={cn(
        "group/node relative flex size-full items-center justify-center rounded-lg border px-3 py-2 text-center text-[13px] leading-snug font-medium transition-shadow",
        stackFor(wb),
        selected && "outline-2 outline-offset-2 outline-cobalt"
      )}
      style={{
        borderColor: wb.color === "default" ? "color-mix(in oklch, var(--ink) 55%, var(--sheet))" : color.stroke,
        backgroundColor: color.fill,
        ["--stack-edge" as string]: wb.color === "default" ? "var(--blueline)" : color.stroke,
      }}
    >
      <Resizer selected={selected} minWidth={80} minHeight={40} />
      {wb.path ? (
        // A node that stands for a repository folder says which one, under
        // its name. The name gives way first: two lines, then the path.
        <span className="flex max-w-full min-w-0 flex-col items-center gap-0.5">
          <span className="line-clamp-2 break-words">{wb.title || "Untitled"}</span>
          <span
            title={wb.path}
            className="max-w-full truncate font-mono text-[10px] leading-tight font-normal tracking-tight text-graphite"
          >
            {wb.path}
          </span>
        </span>
      ) : (
        <span className="line-clamp-3 break-words">{wb.title || "Untitled"}</span>
      )}
      {wb.docId && <DocumentMark objectId={wb.id} docType={wb.docType} className="absolute -top-2.5 -right-2.5" />}
      <Handles visible={selected} />
    </div>
  )
}

export function TextNode({ data, selected }: NodeProps<FlowNode>) {
  const { wb } = data
  const color = COLORS[wb.color]
  return (
    <div
      className={cn(
        "group/node relative flex size-full flex-col gap-1 rounded-md p-2",
        selected ? "outline-2 outline-cobalt" : "hover:outline-1 hover:outline-rule"
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        // Height follows the text.
        shouldResize={(_, params) => params.direction[1] === 0}
        lineClassName="!border-transparent"
        handleClassName="!size-2 !rounded-[2px] !border-cobalt !bg-sheet"
      />
      <h3
        className="font-heading text-lg leading-tight font-semibold break-words"
        style={{ color: wb.color === "default" ? undefined : color.text }}
      >
        {wb.title || "Untitled"}
      </h3>
      {wb.description ? (
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words text-graphite">
          {wb.description}
        </p>
      ) : (
        // A prompt, not content: shown only while the node is selected.
        selected && <p className="text-[13px] text-graphite italic">Add body text in the panel.</p>
      )}
      {wb.docId && <DocumentMark objectId={wb.id} docType={wb.docType} className="absolute -top-2.5 -right-2.5" />}
      <Handles visible={selected} />
    </div>
  )
}

export function GroupNode({ data, selected }: NodeProps<FlowNode>) {
  const { wb } = data
  const color = COLORS[wb.color]
  const tinted = wb.color !== "default"
  return (
    <div
      className={cn(
        "group/node relative size-full rounded-xl border",
        wb.docType === "whiteboard" && "sheet-stack",
        selected && "outline-2 outline-offset-2 outline-cobalt"
      )}
      style={{
        borderColor: tinted ? `color-mix(in oklch, ${color.stroke} 45%, var(--sheet))` : "var(--rule)",
        backgroundColor: tinted
          ? `color-mix(in oklch, ${color.stroke} 5%, var(--paper))`
          : "color-mix(in oklch, var(--ink) 3%, var(--paper))",
        ["--stack-edge" as string]: tinted ? color.stroke : "var(--blueline)",
      }}
    >
      <Resizer selected={selected} minWidth={160} minHeight={100} />
      {wb.title && (
        // A tab on the top edge, like the label on a folder.
        <div
          className="absolute -top-px left-3 max-w-[calc(100%-1.5rem)] -translate-y-1/2 truncate rounded-[5px] border bg-sheet px-1.5 py-px font-mono text-[10px] font-medium tracking-wide uppercase"
          style={{
            borderColor: tinted ? `color-mix(in oklch, ${color.stroke} 45%, var(--sheet))` : "var(--rule)",
            color: tinted ? color.text : "var(--graphite)",
          }}
        >
          {wb.title}
        </div>
      )}
      {wb.docId && <DocumentMark objectId={wb.id} docType={wb.docType} className="absolute -top-2.5 -right-2.5" />}
      <Handles visible={selected} />
    </div>
  )
}

export const nodeTypes = { "wb-plain": PlainNode, "wb-text": TextNode, "wb-group": GroupNode }
