"use client"

import { Code, ExternalLink, Paintbrush, Trash2, X } from "lucide-react"
import { useState } from "react"

import type { EditorUser } from "@/components/editor/text-editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ProjectSource } from "@/lib/github/source"
import { codeLinkOf, codeUrlFromInput, describeCodeUrl, type CodeLink } from "@/lib/whiteboard/code-link"
import type { WhiteboardContext } from "@/lib/whiteboard/description-document"
import { mediaHref } from "@/lib/whiteboard/media"
import {
  COLOR_KEYS,
  COLORS,
  type ColorKey,
  type OpenMode,
  type WbEdge,
  type WbNode,
} from "@/lib/whiteboard/schema"
import { MAX_ALT, MAX_BODY_TEXT, MAX_LABEL, MAX_TITLE, reshape } from "@/lib/whiteboard/limits"
import type { NodeShape } from "@/lib/whiteboard/shapes"
import { nodeLabel } from "@/lib/whiteboard/use-whiteboard"
import { cn } from "@/lib/utils"

import { KEYS } from "./hint-bar"
import { ObjectDocument } from "./object-document"
import { EmojiField, IconField, ShapeField } from "./pickers"

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
  repository,
  onNodeChange,
  onEdgeChange,
  onDelete,
  onClose,
}: {
  selection: { node: WbNode } | { edge: WbEdge }
  editable: boolean
  // The whiteboard is locked: this person may edit, but not until it is unlocked.
  locked: boolean
  context: WhiteboardContext
  user: EditorUser
  repository: ProjectSource | null
  onNodeChange: (id: string, patch: Partial<Omit<WbNode, "id">>) => void
  onEdgeChange: (id: string, patch: Partial<Omit<WbEdge, "id">>) => void
  // Deletes the object, as the Delete key does. Absent when it cannot be.
  onDelete?: () => void
  onClose: () => void
}) {
  const isNode = "node" in selection
  const name = isNode ? selection.node.title : selection.edge.label
  const what = isNode ? nodeLabel(selection.node) : "Arrow"
  const onNode = (patch: Partial<Omit<WbNode, "id">>) => isNode && onNodeChange(selection.node.id, patch)
  const onEdge = (patch: Partial<Omit<WbEdge, "id">>) => !isNode && onEdgeChange(selection.edge.id, patch)

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
      {/* The object's name is typed in the heading, and how it looks is in the
          Style menu beside it, so the panel below is left to what the object
          holds: its page, written at full length. */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-rule bg-sheet/95 px-4 py-2.5 backdrop-blur">
        <span className="shrink-0 rounded-[5px] border border-rule px-1.5 py-px font-mono text-[10px] tracking-wide text-graphite uppercase">
          {what}
        </span>
        {editable ? (
          <NameField selection={selection} onNodeChange={onNode} onEdgeChange={onEdge} />
        ) : (
          <h2 className="min-w-0 flex-1 truncate font-sans text-sm font-medium tracking-normal">
            {name || (isNode ? "Untitled" : "No label")}
          </h2>
        )}
        {editable && (
          <StyleMenu what={what}>
            {isNode ? (
              <NodeStyle
                node={selection.node}
                link={codeLinkOf(selection.node, repository)}
                onChange={onNode}
              />
            ) : (
              <EdgeStyle edge={selection.edge} onChange={onEdge} />
            )}
          </StyleMenu>
        )}
        {onDelete && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${what.toLowerCase()}`}
                  className="hover:bg-destructive/10 hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 />
                </Button>
              }
            />
            <TooltipContent>{`Delete ${KEYS.remove}`}</TooltipContent>
          </Tooltip>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
          <X />
        </Button>
      </header>

      {/* What is worth reading about the object, above its page. On a locked
          whiteboard the controls that change it are left out, not greyed out. */}
      <fieldset disabled={!editable} className="flex flex-col gap-5 p-4 empty:hidden">
        {isNode ? (
          <NodeFields
            node={selection.node}
            link={codeLinkOf(selection.node, repository)}
            editable={editable}
            onChange={onNode}
          />
        ) : (
          <EdgeFields edge={selection.edge} />
        )}
      </fieldset>

      {isNode ? (
        <ObjectDocument
          key={selection.node.id}
          objectId={selection.node.id}
          objectTitle={selection.node.title}
          docId={selection.node.docId}
          docType={selection.node.docType}
          editable={editable}
          locked={locked}
          context={context}
          user={user}
          onChange={onNode}
        />
      ) : (
        <ObjectDocument
          key={selection.edge.id}
          objectId={selection.edge.id}
          objectTitle={selection.edge.label}
          docId={selection.edge.docId}
          docType={selection.edge.docType}
          editable={editable}
          locked={locked}
          context={context}
          user={user}
          onChange={onEdge}
        />
      )}
    </aside>
  )
}

// The name, typed in the panel's heading: a box's title, a picture's
// caption, an arrow's label. Its id is what Enter on the canvas selects
// (whiteboard.tsx, enterSelection).
function NameField({
  selection,
  onNodeChange,
  onEdgeChange,
}: {
  selection: { node: WbNode } | { edge: WbEdge }
  onNodeChange: (patch: Partial<Omit<WbNode, "id">>) => void
  onEdgeChange: (patch: Partial<Omit<WbEdge, "id">>) => void
}) {
  const field = "min-w-0 flex-1 rounded-md border-0 bg-transparent px-1.5 py-1 text-sm font-medium shadow-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 md:text-sm"
  if ("edge" in selection)
    return (
      <Input
        id="wb-label"
        aria-label="Label"
        value={selection.edge.label}
        maxLength={MAX_LABEL}
        placeholder="What this arrow means"
        className={field}
        onChange={(event) => onEdgeChange({ label: event.target.value })}
      />
    )
  const { node } = selection
  return (
    <Input
      id="wb-title"
      aria-label={node.kind === "media" ? "Caption" : "Title"}
      value={node.title}
      maxLength={MAX_TITLE}
      placeholder={node.kind === "media" ? "A caption" : "Untitled"}
      className={field}
      onChange={(event) => onNodeChange({ title: event.target.value })}
    />
  )
}

// How the object looks, in a menu of its own: the panel is for what it holds.
function StyleMenu({ what, children }: { what: string; children: React.ReactNode }) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`Style the ${what.toLowerCase()}`}>
                  <Paintbrush />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Style</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        aria-label="Style"
        // Its keys are the whiteboard's too: undo works from here (whiteboard.tsx).
        data-whiteboard-menu=""
        className="max-h-[min(36rem,var(--available-height))] w-80 gap-5 overflow-y-auto p-4"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

function NodeStyle({
  node,
  link,
  onChange,
}: {
  node: WbNode
  link: CodeLink | null
  onChange: (patch: Partial<Omit<WbNode, "id">>) => void
}) {
  // A box still at the size its shape came in takes the new shape's size.
  const changeShape = (shape: NodeShape) => onChange(reshape(node, shape))
  return (
    <>
      {node.docId && node.docType === "text" && (
        <OpenModeChoice value={node.openMode} onChange={(openMode) => onChange({ openMode })} />
      )}
      {node.kind !== "link" && (
        <CodeField
          key={node.id}
          codeUrl={node.codeUrl}
          link={link}
          editable
          showCard={false}
          onChange={(codeUrl) => onChange({ codeUrl })}
        />
      )}
      {node.kind === "plain" && <ShapeField value={node.shape} onChange={changeShape} />}
      {node.kind !== "media" && node.kind !== "link" && (
        <ColorField value={node.color} onChange={(color) => onChange({ color })} />
      )}
      <IconField value={node.icon} onChange={(icon) => onChange({ icon })} />
      <EmojiField value={node.emoji} onChange={(emoji) => onChange({ emoji })} />
    </>
  )
}

function EdgeStyle({ edge, onChange }: { edge: WbEdge; onChange: (patch: Partial<Omit<WbEdge, "id">>) => void }) {
  return (
    <>
      {edge.docId && edge.docType === "text" && (
        <OpenModeChoice value={edge.openMode} onChange={(openMode) => onChange({ openMode })} />
      )}
      <CodeField
        key={edge.id}
        codeUrl={edge.codeUrl}
        link={edge.codeUrl ? { url: edge.codeUrl, derived: false } : null}
        editable
        showCard={false}
        onChange={(codeUrl) => onChange({ codeUrl })}
      />
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

// Where double-clicking the object opens the page it holds: beside the
// whiteboard, in this panel, or as a page of its own.
function OpenModeChoice({ value, onChange }: { value: OpenMode; onChange: (openMode: OpenMode) => void }) {
  return (
    <Choice
      label="Double-click opens its page"
      value={value}
      options={[
        { value: "panel", label: "In this panel" },
        { value: "navigate", label: "As a full page" },
      ]}
      onChange={onChange}
    />
  )
}

// What is worth reading about a node, above its page: a text node's body
// text, where an imported box came from, and the code it links to.
function NodeFields({
  node,
  link,
  editable,
  onChange,
}: {
  node: WbNode
  link: CodeLink | null
  editable: boolean
  onChange: (patch: Partial<Omit<WbNode, "id">>) => void
}) {
  if (node.kind === "media") return <MediaFields node={node} link={link} editable={editable} onChange={onChange} />
  if (node.kind === "link") return <LinkFields node={node} editable={editable} onChange={onChange} />

  return (
    <>
      {node.kind === "text" && !editable && node.description !== "" && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{node.description}</p>
      )}
      {node.kind === "text" && editable && (
        <Field label="Body text" htmlFor="wb-description" hint="Shown on the whiteboard, under the heading.">
          <Textarea
            id="wb-description"
            value={node.description}
            rows={4}
            maxLength={MAX_BODY_TEXT}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </Field>
      )}
      {node.path && (
        // Set by the import and owned by the repository, so it is shown, not
        // edited. Its code link, unless the box has one of its own, is the
        // folder: the folder is then shown as that link, not twice.
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-graphite">Folder</span>
          {link?.derived ? (
            <CodeCard url={link.url} label={node.path} />
          ) : (
            <p className="rounded-lg border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs break-all text-ink">
              {node.path}
            </p>
          )}
          {/* The README's first paragraph: left out when the README is the
              page right below. */}
          {node.kind === "plain" && node.description && !node.docId && (
            <p className="text-xs leading-relaxed text-graphite">{node.description}</p>
          )}
        </div>
      )}
      <OwnCode link={link} />
    </>
  )
}

// A link card (lib/links): the page's title and description, read when it
// was pasted and the card's own to change, and the address it opens.
function LinkFields({
  node,
  editable,
  onChange,
}: {
  node: WbNode
  editable: boolean
  onChange: (patch: Partial<Omit<WbNode, "id">>) => void
}) {
  return (
    <>
      {editable ? (
        <>
          <Field label="Description" htmlFor="wb-description" hint="Shown on the card when it has no picture.">
            <Textarea
              id="wb-description"
              value={node.description}
              rows={3}
              maxLength={MAX_BODY_TEXT}
              onChange={(event) => onChange({ description: event.target.value })}
            />
          </Field>
        </>
      ) : (
        node.description !== "" && <p className="text-sm leading-relaxed">{node.description}</p>
      )}
      {node.linkUrl && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-graphite">Link</span>
          <a
            href={node.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs break-all text-cobalt underline-offset-2 hover:underline"
          >
            {node.linkUrl}
          </a>
        </div>
      )}
    </>
  )
}

// A picture or a video: its title is the caption under it.
function MediaFields({
  node,
  link,
  editable,
  onChange,
}: {
  node: WbNode
  link: CodeLink | null
  editable: boolean
  onChange: (patch: Partial<Omit<WbNode, "id">>) => void
}) {
  return (
    <>
      {editable ? (
        <>
          <Field
            label="Alt text"
            htmlFor="wb-alt"
            hint={`What this ${node.mediaType === "video" ? "video" : "picture"} shows, for someone who cannot see it.`}
          >
            <Textarea
              id="wb-alt"
              value={node.alt}
              rows={3}
              maxLength={MAX_ALT}
              onChange={(event) => onChange({ alt: event.target.value })}
            />
          </Field>
        </>
      ) : (
        node.alt !== "" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-graphite">Alt text</span>
            <p className="text-sm leading-relaxed">{node.alt}</p>
          </div>
        )
      )}
      {node.mediaPath && (
        <div className="flex items-center justify-between gap-2 text-xs text-graphite">
          {node.mediaWidth && node.mediaHeight && (
            <span className="tabular-nums">
              {node.mediaWidth} × {node.mediaHeight} px
            </span>
          )}
          <a
            href={mediaHref(node.mediaPath)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-cobalt underline-offset-2 hover:underline"
          >
            Open the file <ExternalLink aria-hidden className="size-3" />
          </a>
        </div>
      )}
      <OwnCode link={link} />
    </>
  )
}

// An arrow's label is the panel's heading and its look is in the Style
// menu: what is left to read here is the code it links to.
function EdgeFields({ edge }: { edge: WbEdge }) {
  return <OwnCode link={edge.codeUrl ? { url: edge.codeUrl, derived: false } : null} />
}

// The code an object links to of its own accord (not the folder it was
// imported from, shown as the folder), as a card to open.
function OwnCode({ link }: { link: CodeLink | null }) {
  if (!link || link.derived) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-graphite">Code</span>
      <CodeCard url={link.url} />
    </div>
  )
}

// A code link: the address of the code behind the object, opened in a new
// tab. Typing does not change the whiteboard until the address is done (on
// Enter, or on leaving the field), so nobody else sees half an address and
// one change is one step to undo. Escape puts back what was there.
function CodeField({
  codeUrl,
  link,
  editable,
  showCard = true,
  onChange,
}: {
  codeUrl: string | null
  // What the object opens: its own link, or the folder it was imported from.
  link: CodeLink | null
  editable: boolean
  // Off in the Style menu, where the panel beside it shows the card already.
  showCard?: boolean
  onChange: (codeUrl: string | null) => void
}) {
  const [draft, setDraft] = useState(codeUrl ?? "")
  const [problem, setProblem] = useState<string | null>(null)
  // Someone else (or undo) changed it: show what is there now.
  const [shown, setShown] = useState(codeUrl)
  if (shown !== codeUrl) {
    setShown(codeUrl)
    setDraft(codeUrl ?? "")
    setProblem(null)
  }

  // Shown here unless the folder it was imported from shows it already.
  const own = link && !link.derived ? link : null
  if (!editable && !own) return null

  function commit() {
    const result = codeUrlFromInput(draft)
    if ("problem" in result) return setProblem(result.problem)
    setProblem(null)
    setDraft(result.url ?? "")
    if (result.url !== codeUrl) onChange(result.url)
  }

  const hint = link?.derived
    ? "Opens the folder above. A link here opens that instead."
    : "The https link to a file or a folder. Lines too, like #L10-L20."

  return (
    <div className="flex flex-col gap-1.5">
      {editable ? (
        <Label htmlFor="wb-code" className="text-xs text-graphite">
          Code
        </Label>
      ) : (
        <span className="text-xs text-graphite">Code</span>
      )}
      {own && showCard && <CodeCard url={own.url} />}
      {editable && (
        <>
          <div className="flex items-center gap-1">
            <Input
              id="wb-code"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              placeholder="https://github.com/owner/repo/blob/main/src/file.ts"
              aria-invalid={problem ? true : undefined}
              aria-describedby="wb-code-hint"
              className="font-mono text-xs md:text-xs"
              onChange={(event) => {
                setDraft(event.target.value)
                setProblem(null)
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commit()
                } else if (event.key === "Escape") {
                  setDraft(codeUrl ?? "")
                  setProblem(null)
                }
              }}
            />
            {codeUrl && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove the code link"
                title="Remove the code link"
                onClick={() => {
                  setDraft("")
                  setProblem(null)
                  onChange(null)
                }}
              >
                <X />
              </Button>
            )}
          </div>
          <p
            id="wb-code-hint"
            role={problem ? "alert" : undefined}
            className={cn("text-xs", problem ? "text-destructive" : "text-graphite/80")}
          >
            {problem ?? hint}
          </p>
        </>
      )}
    </div>
  )
}

// A code link as a card: what it points at, whose it is, and the way there.
function CodeCard({ url, label }: { url: string; label?: string }) {
  const described = describeCodeUrl(url)
  const name = label ?? described.label
  const repository = described.repository && described.repository !== name ? described.repository : null
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      aria-label={`Open code: ${repository ? `${name} in ${repository}` : name} (opens in a new tab)`}
      className="group/code flex items-start gap-2 rounded-lg border border-rule bg-paper px-2.5 py-1.5 outline-none transition-colors hover:border-cobalt focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Code aria-hidden className="mt-0.5 size-3.5 shrink-0 text-graphite group-hover/code:text-cobalt" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-xs break-all text-ink">{name}</span>
        {repository && <span className="truncate text-xs text-graphite">{repository}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-cobalt group-hover/code:underline">
        Open <ExternalLink aria-hidden className="size-3" />
      </span>
    </a>
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
