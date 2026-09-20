"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { deleteOrg, leaveOrg, renameOrg } from "./actions"

export function RenameOrgForm({ orgId, initial }: { orgId: string; initial: string }) {
  const [saved, setSaved] = useState(initial)
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await renameOrg(orgId, name)
      if ("error" in result) return setError(result.error)
      setSaved(name.trim())
      setName(name.trim())
      toast.success("Name saved.")
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="org-name">Name</Label>
      <div className="flex gap-2">
        <Input
          id="org-name"
          className="max-w-sm"
          required
          maxLength={80}
          autoComplete="organization"
          aria-invalid={error ? true : undefined}
          aria-describedby="org-name-hint"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={pending || !name.trim() || name.trim() === saved}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {/* The hint and the error share one line, so an error moves nothing. */}
      <p id="org-name-hint" role={error ? "alert" : undefined} className={error ? "text-sm text-destructive" : "text-sm text-graphite"}>
        {error ?? "Shown in the sidebar and on invites."}
      </p>
    </form>
  )
}

export function LeaveOrg({ slug, orgId, orgName }: { slug: string; orgId: string; orgName: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function leave() {
    startTransition(async () => {
      const result = await leaveOrg(slug, orgId)
      if ("error" in result) return void toast.error(result.error)
      toast.success(`You left ${orgName}.`)
      router.push("/")
    })
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive">Leave</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave {orgName}?</DialogTitle>
          <DialogDescription>
            You lose access to its projects right away. To come back, an admin has to invite you again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button variant="destructive" disabled={pending} onClick={leave}>
            {pending ? "Leaving…" : "Leave the org"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteOrg({
  orgId,
  orgName,
  projects,
}: {
  orgId: string
  orgName: string
  projects: number
}) {
  const router = useRouter()
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await deleteOrg(orgId, typed)
      if ("error" in result) return setError(result.error)
      toast.success(`${orgName} was deleted.`)
      router.push("/")
    })
  }

  return (
    <Dialog
      onOpenChange={() => {
        setTyped("")
        setError(null)
      }}
    >
      <DialogTrigger render={<Button variant="destructive">Delete</Button>} />
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Delete {orgName}?</DialogTitle>
            <DialogDescription>
              {projects === 0
                ? "This deletes the org for every member."
                : projects === 1
                  ? "This deletes the org, its 1 project, and every whiteboard and document in it, for every member."
                  : `This deletes the org, its ${projects} projects, and every whiteboard and document in them, for every member.`}{" "}
              It cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-org-name">
              <span>
                Type <span className="font-semibold select-all">{orgName}</span> to confirm
              </span>
            </Label>
            <Input
              id="delete-org-name"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby="delete-org-hint"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <p id="delete-org-hint" role={error ? "alert" : undefined} className={error ? "text-sm text-destructive" : "text-sm text-graphite"}>
              {error ?? "Capital letters and spaces count."}
            </p>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== orgName}>
              {pending ? "Deleting…" : "Delete this org"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
