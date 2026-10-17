"use client"

import { ContextMenu } from "@base-ui/react/context-menu"
import { Group, ImagePlus, Keyboard, Lock, LockOpen, MoreHorizontal, Plus, Redo2, Square, Type, Undo2 } from "lucide-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { NodeKind } from "@/lib/whiteboard/schema"

import { KEYS } from "./hint-bar"

// The command key, as aria-keyshortcuts names it.
const MOD_ARIA = KEYS.mod === "Ctrl" ? "Control" : "Meta"

// What can be added to a whiteboard: from the + button, at the middle of
// the view, or from a right-click (a long press on a touch screen) on the
// empty canvas, where it was pressed. Tab draws boxes from the keyboard.
export type Addition = Extract<NodeKind, "plain" | "text" | "group"> | "media"

// `keys` is the shortcut, shown beside the item and announced as its
// keyboard shortcut rather than as part of its name.
const ADDITIONS: { value: Addition; label: string; keys?: { shown: string; aria: string }; Icon: typeof Square }[] = [
  { value: "plain", label: "Box", keys: { shown: "Tab", aria: "Tab" }, Icon: Square },
  { value: "text", label: "Text", Icon: Type },
  { value: "group", label: "Group", Icon: Group },
  { value: "media", label: "Picture or video", Icon: ImagePlus },
]

function AdditionItems({ media, onAdd }: { media: boolean; onAdd: (addition: Addition) => void }) {
  return ADDITIONS.filter((addition) => media || addition.value !== "media").map(({ value, label, keys, Icon }) => (
    <DropdownMenuItem key={value} aria-keyshortcuts={keys?.aria} onClick={() => onAdd(value)}>
      <Icon />
      {label}
      {keys && <DropdownMenuShortcut aria-hidden>{keys.shown}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  ))
}

// The whiteboard's own controls, in the corner: + to add something, and •••
// for the rest (undo and redo, locking, the shortcuts). A locked whiteboard
// shows Locked in place of +, which unlocks it. Only for someone who may
// edit; everyone else has nothing to change here.
export function WhiteboardTools({
  locked,
  media,
  onAdd,
  onUndo,
  onRedo,
  onLock,
  onShortcuts,
}: {
  locked: boolean
  media: boolean
  onAdd: (addition: Addition) => void
  onUndo: () => void
  onRedo: () => void
  onLock: (locked: boolean) => void
  onShortcuts: () => void
}) {
  return (
    <div
      role="toolbar"
      aria-label="Whiteboard tools"
      // Its menus open outside the canvas; the keys pressed in them are theirs.
      className="flex items-center gap-0.5 rounded-xl border border-rule bg-sheet p-1 shadow-sm"
    >
      {locked ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="sm" aria-label="Locked: click to unlock" className="text-graphite" onClick={() => onLock(false)}>
                <Lock />
                Locked
              </Button>
            }
          />
          <TooltipContent>Locked, so nothing changes by accident. Click to unlock.</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" aria-label="Add" className="text-ink">
                      <Plus />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent>Add a box, text, a group, or a picture. Or right-click the canvas</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-52">
            <AdditionItems media={media} onAdd={onAdd} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="More" className="text-ink">
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem disabled={locked} aria-keyshortcuts={`${MOD_ARIA}+Z`} onClick={onUndo}>
            <Undo2 />
            Undo
            <DropdownMenuShortcut aria-hidden>{KEYS.mod}Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={locked} aria-keyshortcuts={`${MOD_ARIA}+Shift+Z`} onClick={onRedo}>
            <Redo2 />
            Redo
            <DropdownMenuShortcut aria-hidden>
              {KEYS.shift}
              {KEYS.mod}Z
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onLock(!locked)}>
            {locked ? <LockOpen /> : <Lock />}
            {locked ? "Unlock whiteboard" : "Lock whiteboard"}
          </DropdownMenuItem>
          <DropdownMenuItem aria-keyshortcuts="?" onClick={onShortcuts}>
            <Keyboard />
            Keyboard shortcuts
            <DropdownMenuShortcut aria-hidden>?</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// A right-click, or a long press, on the empty canvas: the same list as +,
// added where it was pressed. Anywhere else (a box, an arrow, the tools) it
// opens nothing, and the browser's own menu shows as usual.
export function CanvasMenu({
  enabled,
  media,
  onAdd,
  children,
}: {
  enabled: boolean
  media: boolean
  onAdd: (addition: Addition, at: { x: number; y: number } | null) => void
  children: React.ReactElement
}) {
  // Where it was pressed, for what is added from it.
  const at = useRef<{ x: number; y: number } | null>(null)
  return (
    <ContextMenu.Root
      disabled={!enabled}
      onOpenChange={(open, details) => {
        if (!open) return
        const event = details.event as MouseEvent | undefined
        const target = event?.target as Element | null | undefined
        // The pane itself is what is under the pointer only where nothing
        // is drawn: the boxes and arrows sit inside it.
        if (!target?.classList.contains("react-flow__pane")) return details.cancel()
        at.current = event && "clientX" in event ? { x: event.clientX, y: event.clientY } : null
      }}
    >
      <ContextMenu.Trigger render={children} />
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="isolate z-50 outline-none">
          <ContextMenu.Popup className="z-50 w-52 origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            <AdditionItems media={media} onAdd={(addition) => onAdd(addition, at.current)} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
