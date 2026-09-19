"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { renameItem, type ProjectRef } from "@/app/[org]/[project]/tree-actions"

export function DocumentTitle({
  project,
  documentId,
  title,
  editable,
}: {
  project: ProjectRef
  documentId: string
  title: string
  editable: boolean
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

  if (!editable)
    return <h1 className="px-13 text-3xl font-semibold tracking-tight">{title}</h1>

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
      className="mx-13 bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
    />
  )
}
