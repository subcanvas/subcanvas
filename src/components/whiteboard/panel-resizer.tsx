"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

const WIDTH_KEY = "subcanvas:panel-width"
const MIN_WIDTH = 320
const DEFAULT_WIDTH = 440
// Of the whiteboard's area, so the canvas never shrinks to a sliver.
const MAX_SHARE = 0.6
const KEY_STEP = 24

function storedWidth() {
  const stored = Number(localStorage.getItem(WIDTH_KEY))
  return stored >= MIN_WIDTH ? stored : DEFAULT_WIDTH
}

// The side panel's width, remembered in this browser. `area` is the element
// the canvas and the panel share; the panel may take up to 60% of it.
export function usePanelWidth(area: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(storedWidth)
  const [max, setMax] = useState(Infinity)

  useEffect(() => {
    if (!area.current) return
    const observer = new ResizeObserver(([entry]) =>
      setMax(Math.max(MIN_WIDTH, Math.round(entry.contentRect.width * MAX_SHARE)))
    )
    observer.observe(area.current)
    return () => observer.disconnect()
  }, [area])

  function resize(next: number) {
    // The area has not been measured yet, so there is no limit to hold to.
    if (!Number.isFinite(next)) return
    const clamped = Math.min(max, Math.max(MIN_WIDTH, Math.round(next)))
    setWidth(clamped)
    localStorage.setItem(WIDTH_KEY, String(clamped))
  }

  // A width saved on a wide screen still fits a narrow one.
  return { width: Math.min(width, max), max, resize, reset: () => resize(DEFAULT_WIDTH) }
}

// The handle on the panel's left edge. It sits between the canvas and the
// panel and belongs to neither, so a drag here never reaches the canvas.
export function PanelResizer({
  area,
  width,
  max,
  resize,
  reset,
}: ReturnType<typeof usePanelWidth> & { area: React.RefObject<HTMLElement | null> }) {
  const [dragging, setDragging] = useState(false)

  return (
    <div className="relative z-30 hidden w-0 md:block">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the side panel"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuenow={width}
        title="Drag to resize. Double-click to reset."
        tabIndex={0}
        className="group/resizer absolute inset-y-0 -left-1.5 flex w-3 cursor-col-resize touch-none items-center justify-center outline-none"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          // Keeps the drag from selecting the panel's text.
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
        }}
        onPointerMove={(event) => {
          if (!dragging || !area.current) return
          resize(area.current.getBoundingClientRect().right - event.clientX)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={reset}
        onKeyDown={(event) => {
          const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP
          if (event.key === "ArrowLeft") resize(width + step)
          else if (event.key === "ArrowRight") resize(width - step)
          else if (event.key === "Home") resize(MIN_WIDTH)
          else if (event.key === "End") resize(max)
          else if (event.key === "Enter") reset()
          else return
          event.preventDefault()
        }}
      >
        {/* The line shows the whole edge can be dragged; the grip says where to look. */}
        <span
          className={cn(
            "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover/resizer:bg-cobalt/40 group-focus-visible/resizer:bg-cobalt",
            dragging && "bg-cobalt!"
          )}
        />
        <span
          className={cn(
            "relative h-10 w-1.5 rounded-full border border-rule bg-sheet shadow-xs transition-colors group-hover/resizer:border-cobalt group-hover/resizer:bg-cobalt group-focus-visible/resizer:border-cobalt group-focus-visible/resizer:bg-cobalt",
            dragging && "border-cobalt bg-cobalt"
          )}
        />
      </div>
    </div>
  )
}
