"use client"

import { ChevronDown, X } from "lucide-react"
import { useId, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EMOJI_CATEGORIES } from "@/lib/whiteboard/emoji"
import { ICON_CATEGORIES, iconLabel, iconNode } from "@/lib/whiteboard/icons"
import { singleEmoji } from "@/lib/whiteboard/schema"
import { NODE_SHAPES, SHAPE_LABELS, shapeGeometry, type NodeShape } from "@/lib/whiteboard/shapes"
import { cn } from "@/lib/utils"

import { WhiteboardIcon } from "./icon"

// The pickers of the object panel: a node's shape, and the icon and emoji a
// node or an edge wears.

const SWATCH = { x: 1, y: 1, width: 30, height: 20 }

export function ShapeField({ value, onChange }: { value: NodeShape; onChange: (shape: NodeShape) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-graphite">
        Shape <span className="text-ink">{SHAPE_LABELS[value]}</span>
      </Label>
      <div role="radiogroup" aria-label="Shape" className="flex flex-wrap gap-1.5">
        {NODE_SHAPES.map((shape) => {
          const geometry = shapeGeometry(shape, SWATCH)
          return (
            <button
              key={shape}
              type="button"
              role="radio"
              aria-checked={value === shape}
              aria-label={SHAPE_LABELS[shape]}
              title={SHAPE_LABELS[shape]}
              onClick={() => onChange(shape)}
              className={cn(
                "flex h-8 w-10 items-center justify-center rounded-md border border-rule text-graphite outline-none transition-colors hover:border-cobalt hover:text-cobalt focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                value === shape && "border-cobalt bg-accent text-ink"
              )}
            >
              <svg aria-hidden width={32} height={22} fill="none" stroke="currentColor" strokeLinejoin="round">
                <path d={geometry.outline} />
                {geometry.detail && <path d={geometry.detail} />}
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const matches = (query: string, ...haystack: string[]) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const text = haystack.join(" ").toLowerCase()
  return words.every((word) => text.includes(word))
}

const CELL =
  "flex size-8 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:ring-1 aria-pressed:ring-cobalt"

// The closed state of a picker: what is chosen, a way to open the list, and
// a way to take the choice off again.
function PickerRow({
  label,
  chosen,
  preview,
  open,
  panelId,
  onToggle,
  onRemove,
}: {
  label: string
  chosen: string | null
  preview: React.ReactNode
  open: boolean
  panelId: string
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="min-w-0 flex-1 justify-start gap-2 font-normal"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-ink">{preview}</span>
        <span className={cn("min-w-0 flex-1 truncate text-left", !chosen && "text-graphite")}>
          {chosen ?? `Choose ${label.toLowerCase()}`}
        </span>
        <ChevronDown aria-hidden className={cn("text-graphite transition-transform", open && "rotate-180")} />
      </Button>
      {chosen && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
          <X />
        </Button>
      )}
    </div>
  )
}

export function IconField({ value, onChange }: { value: string | null; onChange: (icon: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const panelId = useId()
  const categories = useMemo(
    () =>
      ICON_CATEGORIES.map((category) => ({
        ...category,
        icons: category.icons.filter((choice) => matches(query, choice.name, choice.label, choice.keywords)),
      })).filter((category) => category.icons.length),
    [query]
  )
  // A name this version cannot draw shows as nothing on the canvas, so it
  // reads as nothing here too.
  const chosen = iconNode(value) ? iconLabel(value) : null

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-graphite">Icon</Label>
      <PickerRow
        label="Icon"
        chosen={chosen}
        preview={<WhiteboardIcon name={value} />}
        open={open}
        panelId={panelId}
        onToggle={() => setOpen(!open)}
        onRemove={() => onChange(null)}
      />
      {open && (
        <div id={panelId} className="flex flex-col gap-2 rounded-lg border border-rule bg-paper p-2">
          <Input
            type="search"
            aria-label="Search icons"
            placeholder="Search icons"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto p-0.5">
            {categories.map((category) => (
              <div key={category.label} role="group" aria-label={category.label} className="flex flex-col gap-1">
                <span className="text-[11px] text-graphite">{category.label}</span>
                <div className="flex flex-wrap gap-0.5">
                  {category.icons.map((choice) => (
                    <button
                      key={choice.name}
                      type="button"
                      aria-label={choice.label}
                      aria-pressed={value === choice.name}
                      title={choice.label}
                      onClick={() => onChange(choice.name)}
                      className={cn(CELL, "text-ink")}
                    >
                      <WhiteboardIcon name={choice.name} className="size-4" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!categories.length && <p className="px-1 py-2 text-xs text-graphite">No icon matches that.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export function EmojiField({ value, onChange }: { value: string | null; onChange: (emoji: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [typed, setTyped] = useState("")
  const panelId = useId()
  const typedId = useId()
  const categories = useMemo(
    () =>
      EMOJI_CATEGORIES.map((category) => ({
        ...category,
        emoji: category.emoji.filter((choice) => matches(query, choice.words)),
      })).filter((category) => category.emoji.length),
    [query]
  )
  const rejected = typed.trim() !== "" && !singleEmoji(typed)
  // Said in a word beside the emoji itself, when it is one from the list.
  const known = EMOJI_CATEGORIES.flatMap((category) => category.emoji).find((choice) => choice.emoji === value)
  const chosen = value ? (known ? known.words.split(" ")[0] : "Your own emoji") : null

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-graphite">Emoji</Label>
      <PickerRow
        label="Emoji"
        chosen={chosen}
        preview={value}
        open={open}
        panelId={panelId}
        onToggle={() => setOpen(!open)}
        onRemove={() => onChange(null)}
      />
      {open && (
        <div id={panelId} className="flex flex-col gap-2 rounded-lg border border-rule bg-paper p-2">
          <Input
            type="search"
            aria-label="Search emoji"
            placeholder="Search emoji"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto p-0.5">
            {categories.map((category) => (
              <div key={category.label} role="group" aria-label={category.label} className="flex flex-col gap-1">
                <span className="text-[11px] text-graphite">{category.label}</span>
                <div className="flex flex-wrap gap-0.5">
                  {category.emoji.map((choice) => (
                    <button
                      key={choice.emoji}
                      type="button"
                      aria-label={choice.words}
                      aria-pressed={value === choice.emoji}
                      title={choice.words}
                      onClick={() => onChange(choice.emoji)}
                      className={cn(CELL, "text-base leading-none")}
                    >
                      {choice.emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!categories.length && <p className="px-1 py-2 text-xs text-graphite">No emoji matches that.</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={typedId} className="text-[11px] text-graphite">
              Or type or paste any emoji
            </Label>
            <Input
              id={typedId}
              value={typed}
              aria-invalid={rejected}
              aria-describedby={rejected ? `${typedId}-error` : undefined}
              placeholder="One emoji"
              onChange={(event) => {
                setTyped(event.target.value)
                const emoji = singleEmoji(event.target.value)
                if (emoji) onChange(emoji)
              }}
            />
            {rejected && (
              <p id={`${typedId}-error`} role="alert" className="text-xs text-destructive">
                That is not a single emoji.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
