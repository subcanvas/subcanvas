// What marks an object or a name: a color, an icon by name, an emoji. Apart
// from the schema so that a page, the sidebar or the server can check them
// without loading the sync library. schema.ts re-exports all of it.

// Colors are stored as keys, not values, so themes can restyle them.
export const COLOR_KEYS = [
  "default", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink",
] as const

export type ColorKey = (typeof COLOR_KEYS)[number]

export const colorKey = (value: unknown): ColorKey | null =>
  COLOR_KEYS.includes(value as ColorKey) ? (value as ColorKey) : null

// An icon is stored by its Lucide name. The name is only checked for form
// here: whether this version can draw it is for whoever draws (icons.ts), so
// a name written by a newer version survives being read by an older one.
const ICON_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
export function iconName(value: unknown) {
  return typeof value === "string" && value.length <= 48 && ICON_NAME.test(value) ? value : null
}

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u

// One emoji and nothing else: a single grapheme (a family or a flag is
// several code points but one grapheme) that a font would draw as a picture.
export function singleEmoji(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 40 || !EMOJI.test(trimmed)) return null
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)]
  return graphemes.length === 1 ? trimmed : null
}
