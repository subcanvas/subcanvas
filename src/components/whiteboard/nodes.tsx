"use client"

import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react"
import { FileText } from "lucide-react"

import { COLORS } from "@/lib/whiteboard/schema"
import type { FlowNode } from "@/lib/whiteboard/use-whiteboard"
import { cn } from "@/lib/utils"

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
            "!size-2.5 !border-2 !border-background !bg-foreground transition-opacity",
            visible ? "opacity-100" : "opacity-0 group-hover/node:opacity-100"
          )}
        />
      ))}
    </>
  )
}

// Marks an object that holds a document (R4.9).
function DocumentMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Has a description"
      title="Has a description"
      className={cn(
        "absolute flex size-4 items-center justify-center rounded-sm bg-background text-muted-foreground ring-1 ring-border",
        className
      )}
    >
      <FileText className="size-3" />
    </span>
  )
}

function Resizer({ selected, minWidth, minHeight }: { selected: boolean; minWidth: number; minHeight: number }) {
  return (
    <NodeResizer
      isVisible={selected}
      minWidth={minWidth}
      minHeight={minHeight}
      lineClassName="!border-ring"
      handleClassName="!size-2 !rounded-sm !border-ring !bg-background"
    />
  )
}

export function PlainNode({ data, selected }: NodeProps<FlowNode>) {
  const color = COLORS[data.wb.color]
  return (
    <div
      className={cn(
        "group/node flex size-full items-center justify-center rounded-md border-2 px-3 py-2 text-center text-sm font-medium",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background"
      )}
      style={{ borderColor: color.stroke, backgroundColor: color.fill }}
    >
      <Resizer selected={selected} minWidth={80} minHeight={40} />
      <span className="line-clamp-3 break-words">{data.wb.title || "Untitled"}</span>
      {data.wb.docId && <DocumentMark className="-top-2 -right-2" />}
      <Handles visible={selected} />
    </div>
  )
}

export function TextNode({ data, selected }: NodeProps<FlowNode>) {
  const color = COLORS[data.wb.color]
  return (
    <div
      className={cn(
        "group/node flex size-full flex-col gap-1 rounded-md p-2",
        selected ? "ring-2 ring-ring" : "hover:ring-1 hover:ring-border"
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        // Height follows the text.
        shouldResize={(_, params) => params.direction[1] === 0}
        lineClassName="!border-transparent"
        handleClassName="!size-2 !rounded-sm !border-ring !bg-background"
      />
      <h3
        className="text-base font-semibold leading-snug break-words"
        style={{ color: data.wb.color === "default" ? undefined : color.stroke }}
      >
        {data.wb.title || "Untitled"}
      </h3>
      {data.wb.description && (
        <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
          {data.wb.description}
        </p>
      )}
      {data.wb.docId && <DocumentMark className="-top-2 -right-2" />}
      <Handles visible={selected} />
    </div>
  )
}

export function GroupNode({ data, selected }: NodeProps<FlowNode>) {
  const color = COLORS[data.wb.color]
  return (
    <div
      className={cn(
        "group/node size-full rounded-lg border-2 border-dashed",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background"
      )}
      style={{
        borderColor: data.wb.color === "default" ? "var(--border)" : color.stroke,
        backgroundColor: data.wb.color === "default" ? "color-mix(in oklch, var(--muted) 50%, transparent)" : color.fill,
      }}
    >
      <Resizer selected={selected} minWidth={160} minHeight={100} />
      {data.wb.title && (
        <div
          className="absolute top-0 left-0 max-w-full truncate rounded-br-md rounded-tl-md px-2 py-0.5 text-xs font-semibold"
          style={{
            color: data.wb.color === "default" ? "var(--muted-foreground)" : color.stroke,
          }}
        >
          {data.wb.title}
        </div>
      )}
      {data.wb.docId && <DocumentMark className="-top-2 -right-2" />}
      <Handles visible={selected} />
    </div>
  )
}

export const nodeTypes = { "wb-plain": PlainNode, "wb-text": TextNode, "wb-group": GroupNode }
