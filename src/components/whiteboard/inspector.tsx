"use client"

import { X } from "lucide-react"

import type { EditorUser } from "@/components/editor/text-editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { WhiteboardContext } from "@/lib/whiteboard/description-document"
import {
  COLOR_KEYS,
  COLORS,
  type ColorKey,
  type WbEdge,
  type WbNode,
} from "@/lib/whiteboard/schema"
import { SHAPE_SIZE, type NodeShape } from "@/lib/whiteboard/shapes"
import { cn } from "@/lib/utils"

import { ObjectDocument } from "./object-document"
import { EmojiField, IconField, ShapeField } from "./pickers"

const KIND_LABELS = { plain: "Node", text: "Text", group: "Group" }

// The panel that opens from the right when one object is selected (R4.3).
// On a wide screen it sits beside the canvas, so nothing is hidden. On a
// narrow one it rises from the bottom as a sheet over the canvas. Its width
// there is the canvas's to give: see panel-resizer.tsx.
export function Inspector({
  selection,
  editable,
  locked,
  context,
  user,
  onNodeChange,
  onEdgeChange,
  onClose,
}: {
  selection: { node: WbNode } | { edge: WbEdge }
  editable: boolean
  // In view mode by choice: this person may edit, but not right now.
  locked: boolean
  context: WhiteboardContext
  user: EditorUser
  onNodeChange: (id: string, patch: Partial<Omit<WbNode, "id">>) => void
  onEdgeChange: (id: string, patch: Partial<Omit<WbEdge, "id">>) => void
  onClose: () => void
}) {
  const isNode = "node" in selection
  const name = isNode ? selection.node.title : selection.edge.label

  return (
    <aside
      aria-label="Object settings"
      className={cn(
        "z-20 flex flex-col overflow-y-auto border-rule bg-sheet",
        // Narrow: a bottom sheet over the canvas.
        "absolute inset-x-0 bottom-0 max-h-[70%] rounded-t-2xl border-t shadow-[0_-8px_30px_rgb(0_0_0/0.12)]",
        // Wide: a column beside the canvas.
        "md:relative md:inset-auto md:max-h-none md:w-(--panel-width) md:shrink-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none"
      )}
    >
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-rule bg-sheet/95 px-4 py-2.5 backdrop-blur">
        <span className="rounded-[5px] border border-rule px-1.5 py-px font-mono text-[10px] tracking-wide text-graphite uppercase">
          {isNode ? KIND_LABELS[selection.node.kind] : "Arrow"}
        </span>
        <h2 className="min-w-0 flex-1 truncate font-sans text-sm font-medium tracking-normal">
          {name || (isNode ? "Untitled" : "No label")}
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
          <X />
        </Button>
      </header>

      <fieldset disabled={!editable} className="flex flex-col gap-5 p-4">
        {isNode ? (
          <NodeFields node={selection.node} onChange={(patch) => onNodeChange(selection.node.id, patch)} />
        ) : (
          <EdgeFields edge={selection.edge} onChange={(patch) => onEdgeChange(selection.edge.id, patch)} />
        )}
      </fieldset>

      {isNode ? (
        <ObjectDocument
          key={selection.node.id}
          objectId={selection.node.id}
          objectTitle={selection.node.title}
          docId={selection.node.docId}
          docType={selection.node.docType}
          openMode={selection.node.openMode}
          editable={editable}
          locked={locked}
          context={context}
          user={user}
          onChange={(patch) => onNodeChange(selection.node.id, patch)}
          onOpenModeChange={(openMode) => onNodeChange(selection.node.id, { openMode })}
        />
      ) : (
        <ObjectDocument
          key={selection.edge.id}
          objectId={selection.edge.id}
          objectTitle={selection.edge.label}
          docId={selection.edge.docId}
          docType={selection.edge.docType}
          openMode={selection.edge.openMode}
          editable={editable}
          locked={locked}
          context={context}
          user={user}
          onChange={(patch) => onEdgeChange(selection.edge.id, patch)}
          onOpenModeChange={(openMode) => onEdgeChange(selection.edge.id, { openMode })}
        />
      )}
    </aside>
  )
}

function NodeFields({
  node,
  onChange,
}: {
  node: WbNode
  onChange: (patch: Partial<Omit<WbNode, "id">>) => void
}) {
  // A node still at the size its shape came in takes the new shape's size,
  // around the same center: a diamond needs more room than a rectangle for
  // the same words. A node somebody has sized keeps its size.
  function changeShape(shape: NodeShape) {
    const from = SHAPE_SIZE[node.shape]
    const to = SHAPE_SIZE[shape]
    const untouched = node.width === from.width && node.height === from.height
    onChange(
      untouched
        ? { shape, ...to, x: node.x + (from.width - to.width) / 2, y: node.y + (from.height - to.height) / 2 }
        : { shape }
    )
  }

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
        <Field label="Body text" htmlFor="wb-description" hint="Shown on the whiteboard, under the heading.">
          <Textarea
            id="wb-description"
            value={node.description}
            rows={4}
            maxLength={2000}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </Field>
      )}
      {node.path && (
        // Set by the import and owned by the repository, so it is shown, not edited.
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-graphite">Folder</span>
          <p className="rounded-lg border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs break-all text-ink">
            {node.path}
          </p>
          {node.kind === "plain" && node.description && (
            <p className="text-xs leading-relaxed text-graphite">{node.description}</p>
          )}
        </div>
      )}
      {node.kind === "plain" && <ShapeField value={node.shape} onChange={changeShape} />}
      <ColorField value={node.color} onChange={(color) => onChange({ color })} />
      <IconField value={node.icon} onChange={(icon) => onChange({ icon })} />
      <EmojiField value={node.emoji} onChange={(emoji) => onChange({ emoji })} />
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
          placeholder="What this arrow means"
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Choice
          label="Line"
          value={edge.shape}
          options={[
            { value: "spline", label: "Curved" },
            { value: "step", label: "Angled" },
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
      </div>
      <Choice
        label="Arrowheads"
        value={edge.direction}
        options={[
          { value: "none", label: "None" },
          { value: "forward", label: "End" },
          { value: "reverse", label: "Start" },
          { value: "both", label: "Both" },
        ]}
        onChange={(direction) => onChange({ direction })}
      />
      <ColorField value={edge.color} onChange={(color) => onChange({ color })} />
      <IconField value={edge.icon} onChange={(icon) => onChange({ icon })} />
      <EmojiField value={edge.emoji} onChange={(emoji) => onChange({ emoji })} />
    </>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-graphite">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-graphite/80">{hint}</p>}
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
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-graphite">{label}</Label>
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
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="flex-1 data-pressed:border-cobalt data-pressed:bg-accent data-pressed:text-ink"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function ColorField({ value, onChange }: { value: ColorKey; onChange: (color: ColorKey) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-graphite">
        Color <span className="text-ink">{COLORS[value].label}</span>
      </Label>
      <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-1.5">
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
              "size-7 rounded-md border outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:hover:scale-100",
              value === key && "ring-2 ring-cobalt ring-offset-2 ring-offset-sheet"
            )}
            style={{ borderColor: COLORS[key].stroke, backgroundColor: COLORS[key].fill }}
          />
        ))}
      </div>
    </div>
  )
}
