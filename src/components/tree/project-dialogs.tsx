"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteProject, renameProject, type ProjectRef } from "@/app/[org]/[project]/tree-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = { project: ProjectRef; projectName: string; open: boolean; onOpenChange: (open: boolean) => void }

export function RenameProjectDialog({ project, projectName, open, onOpenChange }: Props) {
  const [name, setName] = useState(projectName)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await renameProject(project, name)
      if ("error" in result) return setError(result.error)
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setName(projectName)
        setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename-project-name">Name</Label>
            <Input
              id="rename-project-name"
              required
              maxLength={120}
              autoFocus
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button type="submit" disabled={pending || !name.trim() || name.trim() === projectName}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// The same confirmation as deleting an org: the name, typed. A project goes
// for good with everything in it, and its trash goes with it.
export function DeleteProjectDialog({ project, projectName, open, onOpenChange }: Props) {
  const router = useRouter()
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await deleteProject(project, typed)
      if ("error" in result) return setError(result.error)
      toast.success(`${projectName} was deleted.`)
      router.push(`/${project.slug}`)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setTyped("")
        setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Delete {projectName}?</DialogTitle>
            <DialogDescription>
              This deletes the project and every whiteboard, page, picture and video in it, including its trash,
              for every member. Links to it and README embeds of it stop working. It cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-project-name">
              <span>
                Type <span className="font-semibold select-all">{projectName}</span> to confirm
              </span>
            </Label>
            <Input
              id="delete-project-name"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby="delete-project-hint"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            <p
              id="delete-project-hint"
              role={error ? "alert" : undefined}
              className={error ? "text-sm text-destructive" : "text-sm text-graphite"}
            >
              {error ?? "Capital letters and spaces count."}
            </p>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== projectName}>
              {pending ? "Deleting…" : "Delete this project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
