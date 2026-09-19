"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { renameItem, type ProjectRef } from "@/app/[org]/[project]/tree-actions"

export function DocumentTitle({
  project,
  documentId,
  title,
  editable,
  compact = false,
}: {
  project: ProjectRef
  documentId: string
  title: string
  editable: boolean
  // The whiteboard header uses a smaller title with no page gutter.
  compact?: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(title)
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

  const size = compact ? "text-lg font-semibold" : "text-3xl font-semibold tracking-tight"

  if (!editable)
    return <h1 className={cn(size, !compact && "px-13", "truncate")}>{title}</h1>

  return (
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
        compact ? "w-full" : "mx-13",
        "bg-transparent outline-none placeholder:text-muted-foreground"
      )}
    />
  )
}
