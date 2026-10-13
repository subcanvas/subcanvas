"use client"

import { SmilePlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ItemIconMark } from "@/components/item-icon"
import { ItemIconPicker } from "@/components/item-icon-picker"
import type { ItemIcon } from "@/lib/item-icon"
import { cn } from "@/lib/utils"
import { renameItem, setDocumentIcon, type ProjectRef } from "@/app/[org]/[project]/tree-actions"

// A document's title, with the icon in front of it (lib/item-icon.ts). For
// someone who may edit, the title is a field and the icon a button that
// chooses another; without one, the button offers to add one, and shows
// itself on hover and focus so an empty title row stays quiet. What a
// repository owns keeps its title, but its icon is this app's to change:
// `iconEditable` without `editable`.
export function DocumentTitle({
  project,
  documentId,
  title,
  icon: savedIcon,
  editable,
  iconEditable = editable,
  compact = false,
}: {
  project: ProjectRef
  documentId: string
  title: string
  icon: ItemIcon | null
  editable: boolean
  iconEditable?: boolean
  // The whiteboard header uses a smaller title with no page gutter.
  compact?: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(title)
  // Shown at once, put back if the server says no.
  const [icon, setIcon] = useState(savedIcon)
  const [shownIcon, setShownIcon] = useState(savedIcon)
  if (shownIcon !== savedIcon) {
    setShownIcon(savedIcon)
    setIcon(savedIcon)
  }
  const [, startTransition] = useTransition()

  function save() {
    const next = value.trim() || "Untitled"
    setValue(next)
    if (next === title) return
    startTransition(async () => {
      const result = await renameItem(project, "document", documentId, next)
      if ("error" in result) {
        toast.error(result.error)
        setValue(title)
      } else router.refresh()
    })
  }

  function changeIcon(next: ItemIcon | null) {
    const before = icon
    setIcon(next)
    startTransition(async () => {
      const result = await setDocumentIcon(project, documentId, next)
      if ("error" in result) {
        toast.error(result.error)
        setIcon(before)
      } else router.refresh()
    })
  }

  const size = compact
    ? "font-heading text-lg font-semibold tracking-tight"
    : "font-heading text-4xl font-semibold tracking-tight"
  // The icon is about as tall as the title's capitals.
  const mark = compact ? "size-5 text-lg" : "size-9 text-3xl"

  const iconButton = (
    <ItemIconPicker
      icon={icon}
      name={value || "Untitled"}
      onChange={changeIcon}
      trigger={
        <button
          type="button"
          aria-label={icon ? "Change icon" : "Add icon"}
          title={icon ? "Change icon" : "Add icon"}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "size-7" : "size-11",
            !icon &&
              "text-graphite opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-60"
          )}
        >
          <ItemIconMark
            icon={icon}
            className={mark}
            fallback={<SmilePlus aria-hidden className={compact ? "size-4" : "size-6"} />}
          />
        </button>
      }
    />
  )

  if (!editable)
    return (
      <h1 className={cn(size, !compact && "px-13", "group/title flex min-w-0 items-center gap-2")}>
        {iconEditable ? iconButton : <ItemIconMark icon={icon} className={mark} />}
        <span className="truncate">{title}</span>
      </h1>
    )

  return (
    <div className={cn("group/title flex min-w-0 items-center gap-1.5", !compact && "mx-13")}>
      {iconButton}
      <input
        aria-label="Document title"
        value={value}
        maxLength={200}
        placeholder="Untitled"
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
        className={cn(
          size,
          compact ? "field-sizing-content max-w-full min-w-24" : "min-w-0 flex-1",
          "bg-transparent outline-none placeholder:text-muted-foreground"
        )}
      />
    </div>
  )
}
