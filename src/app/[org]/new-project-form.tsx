"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { createProject } from "./actions"

export function NewProjectForm({ slug, orgId }: { slug: string; orgId: string }) {
  const [state, action, pending] = useActionState(
    createProject.bind(null, slug, orgId),
    null
  )

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input name="name" required maxLength={120} aria-label="Project name" placeholder="New project name" />
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}
