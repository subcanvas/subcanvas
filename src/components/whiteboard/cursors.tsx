"use client"

import { useReactFlow, useViewport, ViewportPortal } from "@xyflow/react"
import { useEffect, useRef, useState } from "react"
import type { Awareness } from "y-protocols/awareness"

import type { EditorUser } from "@/components/editor/text-editor"

// Each update is billed once per person in the room, so this is kept modest;
// the CSS transition on the cursor smooths over the gaps.
const SEND_INTERVAL_MS = 125 // 8 updates a second

type RemoteCursor = { clientId: number; name: string; color: string; x: number; y: number }

function readCursors(awareness: Awareness): RemoteCursor[] {
  const cursors: RemoteCursor[] = []
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue
    const { cursor, user } = state as {
      cursor?: { x?: unknown; y?: unknown } | null
      user?: { name?: unknown; color?: unknown }
    }
    if (typeof cursor?.x !== "number" || typeof cursor?.y !== "number") continue
    cursors.push({
      clientId,
      x: cursor.x,
      y: cursor.y,
      name: typeof user?.name === "string" ? user.name : "Someone",
      color: typeof user?.color === "string" ? user.color : "#888888",
    })
  }
  return cursors
}

// Publishes this person's pointer, in canvas coordinates so it lands on the
// same spot whatever anyone's zoom is, and draws everyone else's (R5.2).
// Cursors ride on broadcast, so they come from editors only.
export function Cursors({
  awareness,
  user,
  editable,
  surface,
}: {
  awareness: Awareness
  user: EditorUser
  editable: boolean
  // The element whose pointer movement is tracked.
  surface: React.RefObject<HTMLElement | null>
}) {
  const flow = useReactFlow()
  const { zoom } = useViewport()
  const [cursors, setCursors] = useState<RemoteCursor[]>([])
  const lastSent = useRef(0)

  useEffect(() => {
    const update = () => setCursors(readCursors(awareness))
    awareness.on("change", update)
    return () => awareness.off("change", update)
  }, [awareness])

  useEffect(() => {
    const element = surface.current
    if (!editable || !element) return

    awareness.setLocalStateField("user", { name: user.name, color: user.color })

    const move = (event: PointerEvent) => {
      const now = Date.now()
      if (now - lastSent.current < SEND_INTERVAL_MS) return
      lastSent.current = now
      awareness.setLocalStateField(
        "cursor",
        flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      )
    }
    const leave = () => awareness.setLocalStateField("cursor", null)

    element.addEventListener("pointermove", move)
    element.addEventListener("pointerleave", leave)
    return () => {
      element.removeEventListener("pointermove", move)
      element.removeEventListener("pointerleave", leave)
      leave()
    }
  }, [awareness, editable, flow, surface, user.name, user.color])

  return (
    <ViewportPortal>
      {cursors.map((cursor) => (
        <div
          key={cursor.clientId}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-50 transition-transform duration-150 ease-linear"
          style={{
            // Counter-scale so the cursor stays one size at any zoom.
            transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${1 / zoom})`,
            transformOrigin: "top left",
          }}
        >
          <svg width="16" height="20" viewBox="0 0 16 20" fill={cursor.color}>
            <path d="M0 0 L0 16 L4.5 12 L7.5 19 L10 18 L7 11 L13 11 Z" stroke="white" strokeWidth="1" />
          </svg>
          <span
            className="absolute top-4 left-3 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-white"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.name}
          </span>
        </div>
      ))}
    </ViewportPortal>
  )
}
