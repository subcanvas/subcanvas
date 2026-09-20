"use client"

import { Handle, NodeResizer, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react"
import { FileText, Workflow } from "lucide-react"
import { useEffect } from "react"

import { iconLabel, iconNode } from "@/lib/whiteboard/icons"
import { COLORS, DEFAULT_SIZE, type DocType, type WbNode } from "@/lib/whiteboard/schema"
import { linesThatFit, shapeGeometry, type Point, type Side } from "@/lib/whiteboard/shapes"
import type { FlowNode } from "@/lib/whiteboard/use-whiteboard"
import { cn } from "@/lib/utils"

import { useWhiteboardActions } from "./actions-context"
import { WhiteboardIcon } from "./icon"

// One handle per side. The canvas runs in loose connection mode, so every
// handle can start or end an edge. `anchors` moves each handle onto the
// outline of a shape whose sides are not the sides of its box; an edge ends
// where its handle is.
function Handles({ visible, anchors }: { visible: boolean; anchors?: Record<Side, Point> }) {
  return (
    <>
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={Position[(side[0].toUpperCase() + side.slice(1)) as keyof typeof Position]}
          style={
            anchors && {
              left: anchors[side].x,
              top: anchors[side].y,
              right: "auto",
              bottom: "auto",
              transform: "translate(-50%, -50%)",
            }
          }
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

const CHIP =
  "flex size-5 items-center justify-center rounded-[5px] border border-rule bg-sheet"

// The icon and the emoji an object wears, as small sheets of their own. Not
// controls: they say something about the object and do nothing.
export function Badges({ object }: { object: { icon: string | null; emoji: string | null; color: WbNode["color"] } }) {
  return (
    <>
      {iconNode(object.icon) && (
        <span
          role="img"
          aria-label={`Icon: ${iconLabel(object.icon)}`}
          className={CHIP}
          style={{ color: object.color === "default" ? "var(--ink)" : COLORS[object.color].text }}
        >
          <WhiteboardIcon name={object.icon} className="size-3" />
        </span>
      )}
      {object.emoji && <span className={cn(CHIP, "text-[12px] leading-none")}>{object.emoji}</span>}
    </>
  )
}

// What hangs on a node's top right corner: its icon, its emoji, and the way
// into its document, in one row. The row ends centered on `at`, so the
// document mark is where it has always been and the badges line up to its
// left, along the top edge.
function Corner({ wb, at }: { wb: WbNode; at: Point }) {
  if (!iconNode(wb.icon) && !wb.emoji && !wb.docId) return null
  return (
    <div
      className="pointer-events-none absolute flex -translate-y-1/2 items-center gap-[3px]"
      style={{ right: `calc(100% - ${at.x}px - 0.625rem)`, top: at.y }}
    >
      <Badges object={wb} />
      {wb.docId && <DocumentMark objectId={wb.id} docType={wb.docType} />}
    </div>
  )
}

// The box whose outline is the selection ring: the node's own, grown so the
// ring runs three pixels outside the border. A diamond has no side that faces
// straight out, so its box grows by more to move its edges out as far.
function ringBox(shape: WbNode["shape"], { width, height }: { width: number; height: number }) {
  const diagonal = Math.hypot(width, height)
  const [dx, dy] = shape === "diamond" ? [(3 * diagonal) / height, (3 * diagonal) / width] : [3, 3]
  return { x: -dx, y: -dy, width: width + dx * 2, height: height + dy * 2 }
}

const LINE_HEIGHT = 17.875
const PATH_ROOM = 14.5

export function PlainNode({ id, data, selected, width, height }: NodeProps<FlowNode>) {
  const { wb } = data
  const color = COLORS[wb.color]
  const tinted = wb.color !== "default"
  const stroke = tinted ? color.stroke : "color-mix(in oklch, var(--ink) 55%, var(--sheet))"
  const size = {
    width: width ?? wb.width ?? DEFAULT_SIZE.plain.width!,
    height: height ?? wb.height ?? DEFAULT_SIZE.plain.height!,
  }
  const box = { x: 0, y: 0, ...size }
  const geometry = shapeGeometry(wb.shape, box)
  const stacked = wb.docType === "whiteboard"

  // React Flow measures where the handles are when a node changes size. A
  // change of shape moves them too, and it has to be told.
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => updateNodeInternals(id), [id, wb.shape, updateNodeInternals])

  // The name gives way before the folder path does: two lines with a path,
  // three without, and never more than the shape has room for.
  const lines = linesThatFit(geometry.text.height - (wb.path ? PATH_ROOM : 0), LINE_HEIGHT, wb.path ? 2 : 3)

  return (
    <div className="group/node relative size-full text-center text-[13px] leading-snug font-medium">
      {/* The shape is drawn, not styled, so that every outline is a crisp
          one pixel line at any size. Only the painted shape takes the
          pointer: the empty corners of a diamond's box belong to the canvas. */}
      <svg aria-hidden width={size.width} height={size.height} className="pointer-events-none absolute inset-0 overflow-visible">
        {/* The signature. An object that holds a whiteboard is drawn as a
            stack of sheets, because there are more sheets inside it. A
            description is a note on the same sheet: the mark, no stack. */}
        {stacked &&
          [2, 1].map((sheet) => (
            <path
              key={sheet}
              d={shapeGeometry(wb.shape, { ...box, x: geometry.stackStep.x * sheet, y: geometry.stackStep.y * sheet }).outline}
              fill="var(--sheet)"
              stroke={tinted ? color.stroke : "var(--blueline)"}
              strokeLinejoin="round"
            />
          ))}
        <path
          d={geometry.outline}
          fill={color.fill}
          stroke={stroke}
          strokeLinejoin="round"
          className="pointer-events-auto"
          style={stacked ? undefined : { filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.05))" }}
        />
        {geometry.detail && <path d={geometry.detail} fill="none" stroke={stroke} />}
        {selected && (
          <path
            d={shapeGeometry(wb.shape, ringBox(wb.shape, size)).outline}
            fill="none"
            stroke="var(--cobalt)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
      </svg>
      <Resizer selected={selected} minWidth={80} minHeight={40} />
      <div
        className="pointer-events-none absolute flex flex-col items-center justify-center gap-0.5"
        style={{
          left: geometry.text.x,
          top: geometry.text.y,
          width: geometry.text.width,
          height: geometry.text.height,
        }}
      >
        <span className="line-clamp-3 max-w-full break-words" style={{ WebkitLineClamp: lines }}>
          {wb.title || "Untitled"}
        </span>
        {wb.path && (
          // A node that stands for a repository folder says which one, under
          // its name.
          <span
            title={wb.path}
            className="pointer-events-auto max-w-full truncate font-mono text-[10px] leading-tight font-normal tracking-tight text-graphite"
          >
            {wb.path}
          </span>
        )}
      </div>
      <Corner wb={wb} at={geometry.badge} />
      <Handles visible={selected} anchors={geometry.anchors} />
    </div>
  )
}

export function TextNode({ data, selected, width }: NodeProps<FlowNode>) {
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
      <Corner wb={wb} at={{ x: width ?? wb.width ?? DEFAULT_SIZE.text.width!, y: 0 }} />
      <Handles visible={selected} />
    </div>
  )
}

// How thick the band along a group's border is that takes the pointer.
const GRIP = 12

export function GroupNode({ data, selected, width }: NodeProps<FlowNode>) {
  const { wb } = data
  const color = COLORS[wb.color]
  const tinted = wb.color !== "default"
  const border = tinted ? `color-mix(in oklch, ${color.stroke} 60%, var(--sheet))` : "var(--rule)"
  return (
    // A group is a frame, not a surface: it has no fill and its inside does
    // not take the pointer, so it can be dragged over nodes to collect them
    // and they stay within reach underneath it. It is held by its border and
    // its label.
    <div
      className={cn(
        "group/node relative size-full rounded-xl border",
        wb.docType === "whiteboard" && "sheet-stack",
        selected && "outline-2 outline-offset-2 outline-cobalt"
      )}
      style={{
        borderColor: border,
        ["--stack-edge" as string]: tinted ? color.stroke : "var(--blueline)",
      }}
    >
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <div
          key={side}
          className="pointer-events-auto absolute"
          style={{
            [side]: -GRIP / 2,
            ...(side === "top" || side === "bottom"
              ? { left: 0, right: 0, height: GRIP }
              : { top: 0, bottom: 0, width: GRIP }),
          }}
        />
      ))}
      <Resizer selected={selected} minWidth={160} minHeight={100} />
      {wb.title && (
        // A tab on the top edge, like the label on a folder.
        <div
          className="pointer-events-auto absolute -top-px left-3 max-w-[calc(100%-1.5rem)] -translate-y-1/2 truncate rounded-[5px] border bg-sheet px-1.5 py-px font-mono text-[10px] font-medium tracking-wide uppercase"
          style={{ borderColor: border, color: tinted ? color.text : "var(--graphite)" }}
        >
          {wb.title}
        </div>
      )}
      <Corner wb={wb} at={{ x: width ?? wb.width ?? DEFAULT_SIZE.group.width!, y: 0 }} />
      <Handles visible={selected} />
    </div>
  )
}

export const nodeTypes = { "wb-plain": PlainNode, "wb-text": TextNode, "wb-group": GroupNode }
