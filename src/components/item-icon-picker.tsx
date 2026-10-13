"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { EmojiGrid, IconGrid } from "@/components/whiteboard/pickers"
import type { ItemIcon } from "@/lib/item-icon"
import { cn } from "@/lib/utils"
import { COLORS } from "@/lib/whiteboard/colors"
import { COLOR_KEYS, type ColorKey } from "@/lib/whiteboard/marks"

// Chooses the icon in front of a project's or a document's name: an emoji,
// or an icon in a color, from the same sets a box's panel offers. Picking one
// sets it and is done; a color applies at once to the icon there is.
function ItemIconChooser({
  icon,
  onChange,
  onDone,
}: {
  icon: ItemIcon | null
  onChange: (icon: ItemIcon | null) => void
  onDone: () => void
}) {
  const [tab, setTab] = useState<"emoji" | "icon">(icon && "icon" in icon ? "icon" : "emoji")
  const [color, setColor] = useState<ColorKey>(icon && "icon" in icon ? icon.color : "default")
  const pick = (next: ItemIcon | null) => {
    onChange(next)
    onDone()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <div role="group" aria-label="Kind of icon" className="flex gap-0.5 rounded-md bg-muted p-0.5">
          {(["emoji", "icon"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={tab === kind}
              onClick={() => setTab(kind)}
              className="rounded px-2.5 py-1 text-xs text-graphite outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-sheet aria-pressed:text-ink aria-pressed:shadow-xs"
            >
              {kind === "emoji" ? "Emoji" : "Icon"}
            </button>
          ))}
        </div>
        {icon && (
          <Button type="button" variant="ghost" size="sm" className="ml-auto text-graphite" onClick={() => pick(null)}>
            Remove
          </Button>
        )}
      </div>

      {tab === "emoji" ? (
        <EmojiGrid value={icon && "emoji" in icon ? icon.emoji : null} onPick={(emoji) => pick({ emoji })} />
      ) : (
        <>
          <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-1">
            {COLOR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={color === key}
                aria-label={COLORS[key].label}
                title={COLORS[key].label}
                onClick={() => {
                  setColor(key)
                  // The icon there is takes the color at once.
                  if (icon && "icon" in icon) onChange({ icon: icon.icon, color: key })
                }}
                className={cn(
                  "size-6 rounded-full border-2 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
                  color === key && "ring-2 ring-cobalt ring-offset-1 ring-offset-sheet"
                )}
                style={{ borderColor: COLORS[key].stroke, background: COLORS[key].fill }}
              />
            ))}
          </div>
          <IconGrid
            value={icon && "icon" in icon ? icon.icon : null}
            color={color === "default" ? undefined : COLORS[color].text}
            onPick={(name) => pick({ icon: name, color })}
          />
        </>
      )}
    </div>
  )
}

// Opened from a button in front of the name (a page's title).
export function ItemIconPicker({
  icon,
  name,
  onChange,
  trigger,
}: {
  icon: ItemIcon | null
  // What it is the icon of, for the popup's label.
  name: string
  onChange: (icon: ItemIcon | null) => void
  trigger: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-80 p-2" aria-label={`Icon for ${name}`}>
        <ItemIconChooser icon={icon} onChange={onChange} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

// Opened from a menu (the sidebar's), which has nothing to anchor a popup to.
export function ItemIconDialog({
  icon,
  name,
  onChange,
  open,
  onOpenChange,
}: {
  icon: ItemIcon | null
  name: string
  onChange: (icon: ItemIcon | null) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Icon for {name}</DialogTitle>
        </DialogHeader>
        <ItemIconChooser icon={icon} onChange={onChange} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
