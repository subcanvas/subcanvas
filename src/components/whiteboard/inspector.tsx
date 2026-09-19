"use client"

import { X } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { TextDocument } from "@/components/editor/text-document"
import type { EditorUser } from "@/components/editor/text-editor"
import { createClient } from "@/lib/supabase/client"
import {
  ensureDescriptionDocument,
  type WhiteboardContext,
} from "@/lib/whiteboard/description-document"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  COLOR_KEYS,
  COLORS,
  type ColorKey,
  type WbEdge,
  type WbNode,
} from "@/lib/whiteboard/schema"
import { cn } from "@/lib/utils"

const KIND_LABELS = { plain: "Node", text: "Text node", group: "Group" }

const WIDTH_KEY = "graph-notes:panel-width"
const MIN_WIDTH = 320
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 440

function storedWidth() {
  const stored = Number(globalThis.localStorage?.getItem(WIDTH_KEY))
  return stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH
}

// The panel that opens from the right when one object is selected (R4.3).
// It sits beside the canvas rather than over it, so nothing is hidden.
export function Inspector({
  selection,
  editable,
  context,
  user,
  onNodeChange,
  onEdgeChange,
  onClose,
}: {
  selection: { node: WbNode } | { edge: WbEdge }
  editable: boolean
  context: WhiteboardContext
  user: EditorUser
  onNodeChange: (id: string, patch: Partial<Omit<WbNode, "id">>) => void
  onEdgeChange: (id: string, patch: Partial<Omit<WbEdge, "id">>) => void
  onClose: () => void
}) {
  const [width, setWidth] = useState(storedWidth)
  const panel = useRef<HTMLElement>(null)

  function resize(next: number) {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(next)))
    setWidth(clamped)
    localStorage.setItem(WIDTH_KEY, String(clamped))
  }

  return (
    <aside
      ref={panel}
      aria-label="Object settings"
      style={{ width }}
      className="relative flex shrink-0 flex-col gap-5 overflow-y-auto border-l bg-background p-4"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize outline-none hover:bg-ring/40 focus-visible:bg-ring/60"
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId) || !panel.current) return
          resize(panel.current.getBoundingClientRect().right - event.clientX)
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") resize(width + 24)
          if (event.key === "ArrowRight") resize(width - 24)
        }}
      />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {"node" in selection ? KIND_LABELS[selection.node.kind] : "Edge"}
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
          <X />
        </Button>
      </div>

      <fieldset disabled={!editable} className="flex flex-col gap-5">
        {"node" in selection ? (
          <NodeFields node={selection.node} onChange={(patch) => onNodeChange(selection.node.id, patch)} />
        ) : (
          <EdgeFields edge={selection.edge} onChange={(patch) => onEdgeChange(selection.edge.id, patch)} />
        )}
      </fieldset>

      {"node" in selection && (
        <NodeDescription
          key={selection.node.id}
          node={selection.node}
          editable={editable}
          context={context}
          user={user}
          onAttach={(docId) => onNodeChange(selection.node.id, { docId })}
        />
      )}
    </aside>
  )
}

// A node's description is a full text document, created the first time
// someone writes in it (R4.2) and edited right here (R4.5).
function NodeDescription({
  node,
  editable,
  context,
  user,
  onAttach,
}: {
  node: WbNode
  editable: boolean
  context: WhiteboardContext
  user: EditorUser
  onAttach: (docId: string) => void
}) {
  const [pending, startTransition] = useTransition()
  // Focus the editor only when this person just created the document.
  const [justCreated, setJustCreated] = useState(false)

  function create() {
    startTransition(async () => {
      const result = await ensureDescriptionDocument(createClient(), context, node.id, node.title)
      if ("error" in result) toast.error(result.error)
      else {
        setJustCreated(true)
        onAttach(result.id)
      }
    })
  }

  return (
    <section aria-label="Description" className="-mx-4 flex flex-1 flex-col gap-2 border-t pt-4">
      <h3 className="px-4 text-sm font-medium">Description</h3>
      {node.docId ? (
        // A narrower gutter than the full page, leaving room for block handles.
        <div className="[&_.bn-editor]:px-11! [&_.px-13]:px-11!">
          <TextDocument
            documentId={node.docId}
            user={user}
            editable={editable}
            autoFocus={justCreated}
          />
        </div>
      ) : editable ? (
        <button
          type="button"
          disabled={pending}
          onClick={create}
          className="mx-4 min-h-24 cursor-text rounded-md border border-dashed p-3 text-left text-sm text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {pending ? "Creating…" : "Write a description…"}
        </button>
      ) : (
        <p className="px-4 text-sm text-muted-foreground">No description.</p>
      )}
    </section>
  )
}

function NodeFields({
  node,
  onChange,
}: {
  node: WbNode
  onChange: (patch: Partial<Omit<WbNode, "id">>) => void
}) {
  return (
    <>
      <Field label="Title" htmlFor="wb-title">
        <Input
          id="wb-title"
          value={node.title}
          maxLength={200}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </Field>
      {node.kind === "text" && (
        <Field label="Body text" htmlFor="wb-description">
          <Textarea
            id="wb-description"
            value={node.description}
            rows={5}
            maxLength={2000}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </Field>
      )}
      <ColorField value={node.color} onChange={(color) => onChange({ color })} />
    </>
  )
}

function EdgeFields({
  edge,
  onChange,
}: {
  edge: WbEdge
  onChange: (patch: Partial<Omit<WbEdge, "id">>) => void
}) {
  return (
    <>
      <Field label="Label" htmlFor="wb-label">
        <Input
          id="wb-label"
          value={edge.label}
          maxLength={120}
          placeholder="None"
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </Field>
      <Choice
        label="Line"
        value={edge.shape}
        options={[
          { value: "spline", label: "Curved" },
          { value: "step", label: "Right angles" },
        ]}
        onChange={(shape) => onChange({ shape })}
      />
      <Choice
        label="Stroke"
        value={edge.stroke}
        options={[
          { value: "solid", label: "Solid" },
          { value: "dotted", label: "Dotted" },
        ]}
        onChange={(stroke) => onChange({ stroke })}
      />
      <Choice
        label="Arrow"
        value={edge.direction}
        options={[
          { value: "none", label: "None" },
          { value: "forward", label: "Forward" },
          { value: "reverse", label: "Reverse" },
          { value: "both", label: "Both" },
        ]}
        onChange={(direction) => onChange({ direction })}
      />
      <ColorField value={edge.color} onChange={(color) => onChange({ color })} />
    </>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <ToggleGroup
        aria-label={label}
        variant="outline"
        size="sm"
        spacing={0}
        value={[value]}
        // One option is always on: clicking the active one changes nothing.
        onValueChange={(next) => {
          const picked = next.find((item) => item !== value) as T | undefined
          if (picked) onChange(picked)
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function ColorField({ value, onChange }: { value: ColorKey; onChange: (color: ColorKey) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Color</Label>
      <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
        {COLOR_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            aria-label={COLORS[key].label}
            title={COLORS[key].label}
            onClick={() => onChange(key)}
            className={cn(
              "size-6 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              value === key && "ring-2 ring-ring ring-offset-2 ring-offset-background"
            )}
            style={{ borderColor: COLORS[key].stroke, backgroundColor: COLORS[key].fill }}
          />
        ))}
      </div>
    </div>
  )
}
