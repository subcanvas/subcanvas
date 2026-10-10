"use client"

import { X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

import { KEYS } from "./hint-bar"

// Every shortcut on a whiteboard, in a card beside the canvas. `?` shows and
// hides it, and it stays until it is closed, from one whiteboard to the next,
// so someone learning the keys can keep it in view while they draw. The hint
// bar says what fits the moment; this says everything.

const OPEN_KEY = "subcanvas:shortcuts-open"

export function storedShortcutsOpen() {
  return localStorage.getItem(OPEN_KEY) === "true"
}

export function useShortcutsOpen() {
  const [open, setOpen] = useState(storedShortcutsOpen)
  const change = (next: boolean) => {
    setOpen(next)
    localStorage.setItem(OPEN_KEY, String(next))
  }
  return [open, change] as const
}

type Shortcut = { keys: string[][]; does: string }

function shortcuts(): { heading: string; items: Shortcut[] }[] {
  const { mod, shift, alt, enter, remove } = KEYS
  return [
    {
      heading: "Drawing",
      items: [
        { keys: [["Tab"]], does: "Draw the next box to the right" },
        { keys: [[shift, "Tab"]], does: "Draw a box below" },
        { keys: [[enter]], does: "Rename a box, or open what it holds" },
        { keys: [["Esc"]], does: "Stop renaming, or clear the selection" },
        { keys: [[shift, "A"]], does: "Arrange the selection" },
        { keys: [[mod, "D"]], does: "Duplicate" },
        { keys: [[mod, "C"], [mod, "X"], [mod, "V"]], does: "Copy, cut, paste" },
        { keys: [[remove]], does: "Delete" },
        { keys: [[mod, "Z"], [mod, shift, "Z"]], does: "Undo, redo" },
      ],
    },
    {
      heading: "Moving around",
      items: [
        { keys: [[alt, "Arrows"]], does: "Go to the next box that way" },
        { keys: [["Arrows"], [shift, "Arrows"]], does: "Nudge, or move by one dot" },
        { keys: [[mod, "A"]], does: "Select everything" },
        { keys: [["Space", "drag"]], does: "Pan" },
        { keys: [[mod, "scroll"]], does: "Zoom" },
      ],
    },
    {
      heading: "This whiteboard",
      items: [
        { keys: [["E"]], does: "Switch between editing and viewing" },
        { keys: [["?"]], does: "Show or hide these shortcuts" },
      ],
    },
  ]
}

function Keys({ keys }: { keys: string[][] }) {
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {keys.map((combination) => (
        <span key={combination.join("+")} className="flex gap-0.5">
          {combination.map((key) => (
            <kbd
              key={key}
              className="rounded-[4px] border border-rule bg-paper px-1 font-sans text-[11px] leading-4 text-ink"
            >
              {key}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  )
}

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <section
      aria-label="Keyboard shortcuts"
      className="flex max-h-[min(32rem,calc(100svh-12rem))] w-72 flex-col rounded-lg border border-rule bg-sheet/95 shadow-sm backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-rule py-1 pr-1 pl-3">
        <h2 className="text-xs font-semibold">Keyboard shortcuts</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Hide the shortcuts" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="flex flex-col gap-3 overflow-y-auto px-3 py-2.5">
        {shortcuts().map((group) => (
          <div key={group.heading} className="flex flex-col gap-1">
            <h3 className="font-mono text-[10px] tracking-wide text-graphite uppercase">{group.heading}</h3>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => (
                <li key={item.does} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-ink">{item.does}</span>
                  <Keys keys={item.keys} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
