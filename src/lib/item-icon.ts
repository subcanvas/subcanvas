import { iconNode } from "@/lib/whiteboard/icons"
import { colorKey, iconName, singleEmoji, type ColorKey } from "@/lib/whiteboard/marks"

// The icon a project or a document wears in front of its name, everywhere
// the name is shown: one emoji, or one of the whiteboard's icons (icons.ts)
// in one of its colors (colors.ts). The same marks a box can wear, so there
// is one set to learn. Stored as JSON in projects.icon and documents.icon
// (migration item_icons), which checks the shape; this checks the rest.

export type ItemIcon = { emoji: string } | { icon: string; color: ColorKey }

// What was stored, or null for anything that is not one: the column is
// JSON, and a newer version may have written something this one cannot read.
export function readItemIcon(value: unknown): ItemIcon | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const emoji = singleEmoji(record.emoji)
  if (emoji) return { emoji }
  const icon = iconName(record.icon)
  if (icon) return { icon, color: colorKey(record.color) ?? "default" }
  return null
}

// What an agent or a form asked for, checked the same way, or an error to
// say back. Null takes the icon off.
export function itemIconFrom(input: {
  emoji?: string | null
  icon?: string | null
  color?: string | null
}): { icon: ItemIcon | null } | { error: string } {
  if (input.emoji && input.icon) return { error: "Choose an emoji or an icon, not both." }
  if (input.emoji) {
    const emoji = singleEmoji(input.emoji)
    return emoji ? { icon: { emoji } } : { error: "That is not a single emoji." }
  }
  if (input.icon) {
    // Only one this version can draw: reading is lenient, writing is not.
    const icon = iconName(input.icon)
    if (!icon || !iconNode(icon)) return { error: `There is no icon named ${JSON.stringify(input.icon)}.` }
    const color = input.color ? colorKey(input.color) : "default"
    if (!color) return { error: "That is not one of the colors." }
    return { icon: { icon, color } }
  }
  return { icon: null }
}

export const sameItemIcon = (a: ItemIcon | null, b: ItemIcon | null) =>
  JSON.stringify(a) === JSON.stringify(b)
