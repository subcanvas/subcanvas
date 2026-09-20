"use client"

// Apple keyboards print symbols on these keys; the rest print words.
const isApple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
export const KEYS = isApple
  ? { mod: "⌘", shift: "⇧", enter: "↵", remove: "⌫" }
  : { mod: "Ctrl", shift: "Shift", enter: "Enter", remove: "Del" }

// True when the platform's command key is down, and the other one is not:
// on a Mac, Ctrl+C is not copy.
export const isModKey = (event: KeyboardEvent) => (isApple ? event.metaKey : event.ctrlKey)

export type HintState =
  // Someone who may not edit, or who has switched editing off.
  | { looking: true; canSwitchToEdit: boolean }
  | { looking: false; nodes: number; edges: number }

// `wide` hints are the first to go when the canvas is narrow, which it is
// whenever the side panel is open.
type Hint = { keys?: string[]; text: string; wide?: boolean }

function hintsFor(state: HintState): Hint[] {
  const pan: Hint = { text: "Scroll to pan" }
  const zoom: Hint = { text: `Pinch or ${KEYS.mod} scroll to zoom` }
  const open: Hint = { keys: [KEYS.enter], text: "or double-click to open" }
  const duplicate: Hint = { keys: [KEYS.mod, "D"], text: "duplicate" }
  const remove: Hint = { keys: [KEYS.remove], text: "delete" }
  const navigate: Hint[] = [pan, zoom, { text: "Drag to select" }, { keys: ["Space"], text: "drag to pan", wide: true }]

  if (state.looking)
    return state.canSwitchToEdit
      ? [{ keys: ["E"], text: "to edit" }, pan, zoom, { text: "Double-click to open", wide: true }]
      : [...navigate, { text: "Double-click to open", wide: true }]

  if (state.nodes > 1)
    return [
      { keys: [KEYS.shift, "A"], text: "arrange" },
      duplicate,
      { keys: [KEYS.mod, "C"], text: "copy", wide: true },
      { keys: ["Arrows"], text: "nudge", wide: true },
      remove,
    ]
  if (state.nodes === 1 && state.edges === 0)
    return [open, { text: "Drag from its edge to connect", wide: true }, duplicate, remove]
  if (state.nodes === 0 && state.edges === 1)
    return [open, { text: "Label and style it in the panel", wide: true }, remove]
  if (state.nodes + state.edges > 0) return [remove, { keys: ["Esc"], text: "clear the selection" }]
  return [...navigate, { keys: ["E"], text: "view mode", wide: true }]
}

// What the keyboard and pointer do right now, given what is selected.
export function HintBar({ state }: { state: HintState }) {
  return (
    // One line or nothing: wrapped, the pill turns into a blob.
    <p className="hidden items-center rounded-full border border-rule bg-sheet/90 px-3 py-1 text-xs whitespace-nowrap text-graphite shadow-xs backdrop-blur @xl:flex">
      {hintsFor(state).map((hint, index) => (
        <span key={hint.text} className={hint.wide ? "hidden @4xl:inline" : undefined}>
          {index > 0 && <span className="mx-2 text-rule">/</span>}
          {hint.keys?.map((key) => (
            <kbd
              key={key}
              className="mr-1 rounded-[4px] border border-rule bg-paper px-1 font-sans text-[11px] leading-4 text-ink"
            >
              {key}
            </kbd>
          ))}
          {hint.text}
        </span>
      ))}
    </p>
  )
}
