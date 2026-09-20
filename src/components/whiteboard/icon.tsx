import { createElement } from "react"

import { iconNode } from "@/lib/whiteboard/icons"
import { cn } from "@/lib/utils"

// One of the whiteboard's icons, drawn from the same data the image renderer
// uses. Decorative on its own: whoever shows it says what it means in words.
// Draws nothing for a name this version does not have.
export function WhiteboardIcon({ name, className }: { name: string | null; className?: string }) {
  const node = iconNode(name)
  if (!node) return null
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
    >
      {node.map(([tag, attributes], i) => createElement(tag, { key: i, ...attributes }))}
    </svg>
  )
}
