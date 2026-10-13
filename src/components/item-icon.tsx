import { WhiteboardIcon } from "@/components/whiteboard/icon"
import type { ItemIcon } from "@/lib/item-icon"
import { cn } from "@/lib/utils"
import { COLORS } from "@/lib/whiteboard/colors"
import { iconNode } from "@/lib/whiteboard/icons"

// The icon in front of a project's or a document's name (lib/item-icon.ts):
// its emoji, or its icon in its color. `fallback` is what is shown without
// one, or with one this version cannot draw: the sidebar's own icon for the
// kind of thing, say. Decorative: the name beside it says what it is.
export function ItemIconMark({
  icon,
  className,
  fallback = null,
}: {
  icon: ItemIcon | null
  className?: string
  fallback?: React.ReactNode
}) {
  if (!icon) return fallback
  if ("emoji" in icon)
    return (
      <span
        aria-hidden
        className={cn("inline-flex size-4 shrink-0 items-center justify-center leading-none", className)}
      >
        <span className="text-[0.95em]">{icon.emoji}</span>
      </span>
    )
  if (!iconNode(icon.icon)) return fallback
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}
      // The readable shade of the color, so a light one shows on the sheet.
      style={icon.color === "default" ? undefined : { color: COLORS[icon.color].text }}
    >
      <WhiteboardIcon name={icon.icon} className="size-full" />
    </span>
  )
}
