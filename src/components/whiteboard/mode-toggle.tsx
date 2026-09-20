"use client"

import { Eye, Pencil } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type Mode = "edit" | "view"

const MODE_KEY = "subcanvas:whiteboard-mode"

// The last choice made in this browser. Without one, a mouse starts in edit
// mode, since that is what an editor came to do; a touch screen starts in
// view mode, since a finger moves a node just by scrolling past it.
export function storedMode(): Mode {
  const stored = localStorage.getItem(MODE_KEY)
  if (stored === "edit" || stored === "view") return stored
  return matchMedia("(pointer: coarse)").matches ? "view" : "edit"
}

export function storeMode(mode: Mode) {
  localStorage.setItem(MODE_KEY, mode)
}

const OPTIONS = [
  { value: "edit", label: "Edit", hint: "Edit: move, connect and change things", Icon: Pencil },
  { value: "view", label: "View", hint: "View: look around without changing anything", Icon: Eye },
] as const

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <ToggleGroup
      aria-label="Whiteboard mode"
      size="sm"
      spacing={0}
      value={[mode]}
      // One is always on: clicking the active one changes nothing.
      onValueChange={(next) => {
        const picked = next.find((item) => item !== mode) as Mode | undefined
        if (picked) onChange(picked)
      }}
      className="rounded-lg bg-muted p-0.5"
    >
      {OPTIONS.map(({ value, label, hint, Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                value={value}
                aria-label={`${label} mode`}
                className="rounded-md! text-graphite data-pressed:bg-sheet data-pressed:text-ink data-pressed:shadow-xs"
              >
                <Icon />
                {/* Spelled out when there is room, and always in view mode, where
                    it is the one thing that says why nothing can be changed. */}
                <span className={mode === "view" ? undefined : "hidden @3xl:inline"}>{label}</span>
              </ToggleGroupItem>
            }
          />
          <TooltipContent>
            {hint} <kbd className="ml-1 font-sans opacity-70">E</kbd>
          </TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  )
}
