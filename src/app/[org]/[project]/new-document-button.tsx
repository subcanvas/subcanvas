"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

import { createTextDocument } from "../actions"

export function NewDocumentButton({
  slug,
  orgId,
  projectId,
}: {
  slug: string
  orgId: string
  projectId: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await createTextDocument(slug, orgId, projectId)
          if (result?.error) toast.error(result.error)
        })
      }
    >
      {pending ? "Creating…" : "New text document"}
    </Button>
  )
}
