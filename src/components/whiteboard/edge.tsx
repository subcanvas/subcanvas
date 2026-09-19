"use client"

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react"

import { COLORS } from "@/lib/whiteboard/schema"
import type { FlowEdge } from "@/lib/whiteboard/use-whiteboard"
import { cn } from "@/lib/utils"

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
          stroke: COLORS[wb?.color ?? "default"].stroke,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: wb?.stroke === "dotted" ? "2 6" : undefined,
          strokeLinecap: wb?.stroke === "dotted" ? "round" : undefined,
        }}
      />
      {wb && (wb.label || wb.docId) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute flex items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {wb.label && (
              <span
                className={cn(
                  "rounded border bg-background px-1.5 py-0.5 text-xs font-medium",
                  selected && "border-ring"
                )}
              >
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
