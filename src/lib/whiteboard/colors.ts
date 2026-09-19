import type { ColorKey } from "./schema"

// The whiteboard palette, apart from the schema so that a page can use the
// colors without loading the sync library.
//
// A color is one pencil: a stroke, and a fill that is the same pencil pressed
// lightly onto the sheet. Fills are mixed with the sheet, not made
// transparent, so the grid never shows through and dark mode just works.
// `text` is the same pencil for words: the stroke is a border color and too
// light to read, so each theme has a readable shade (globals.css).
const pencil = (key: string, label: string, stroke: string) => ({
  label,
  stroke,
  fill: `color-mix(in oklch, ${stroke} 9%, var(--sheet))`,
  text: `var(--pencil-${key}-text)`,
})

export const COLORS: Record<ColorKey, { label: string; stroke: string; fill: string; text: string }> = {
  default: { label: "Ink", stroke: "var(--ink)", fill: "var(--sheet)", text: "var(--ink)" },
  red: pencil("red", "Red", "#e5484d"),
  orange: pencil("orange", "Orange", "#f76b15"),
  yellow: pencil("yellow", "Yellow", "#d99a1c"),
  green: pencil("green", "Green", "#2b9a66"),
  teal: pencil("teal", "Teal", "#12a594"),
  blue: pencil("blue", "Blue", "#0b7fe0"),
  purple: pencil("purple", "Purple", "#8e4ec6"),
  pink: pencil("pink", "Pink", "#d6409f"),
}
