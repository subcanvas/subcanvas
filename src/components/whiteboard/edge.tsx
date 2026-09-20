"use client"

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react"

import { iconLabel, iconNode } from "@/lib/whiteboard/icons"
import { COLORS } from "@/lib/whiteboard/schema"
import type { FlowEdge } from "@/lib/whiteboard/use-whiteboard"
import { cn } from "@/lib/utils"

import { WhiteboardIcon } from "./icon"
import { DocumentMark } from "./nodes"

export function WhiteboardEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  selected,
  data,
}: EdgeProps<FlowEdge>) {
  const wb = data?.wb
  const hasIcon = Boolean(wb && iconNode(wb.icon))
  // An icon or an emoji is a label too: the pill shows with no words in it.
  const labelled = Boolean(wb && (wb.label || hasIcon || wb.emoji))
  const geometry = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
  const [path, labelX, labelY] =
    wb?.shape === "step"
      ? // Radius 0 gives true 90 degree corners.
        getSmoothStepPath({ ...geometry, borderRadius: 0 })
      : getBezierPath(geometry)

  return (
    <>
      <BaseEdge
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{
          stroke: selected
            ? "var(--cobalt)"
            : !wb || wb.color === "default"
              ? "var(--graphite)"
              : COLORS[wb.color].stroke,
          strokeWidth: selected ? 2.25 : 1.5,
          strokeDasharray: wb?.stroke === "dotted" ? "2 6" : undefined,
          strokeLinecap: wb?.stroke === "dotted" ? "round" : undefined,
        }}
      />
      {wb && (labelled || wb.docId) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute flex items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {labelled && (
              <span
                className={cn(
                  "flex h-5 items-center gap-1 rounded-[5px] border border-rule bg-sheet px-1.5 font-mono text-[11px] text-graphite",
                  selected && "border-cobalt text-ink"
                )}
              >
                {hasIcon && (
                  <span
                    role="img"
                    aria-label={`Icon: ${iconLabel(wb.icon)}`}
                    className="flex"
                    style={{ color: wb.color === "default" ? undefined : COLORS[wb.color].text }}
                  >
                    <WhiteboardIcon name={wb.icon} className="size-3" />
                  </span>
                )}
                {wb.emoji && <span className="font-sans leading-none">{wb.emoji}</span>}
                {wb.label}
              </span>
            )}
            {wb.docId && (
              <DocumentMark objectId={wb.id} docType={wb.docType} className="static" />
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = { wb: WhiteboardEdge }
