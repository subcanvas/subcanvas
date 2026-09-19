"use client"

import { Globe, Lock } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { setProjectVisibility, type ProjectRef } from "@/app/[org]/[project]/tree-actions"
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

// Shows who can see the project, all the time, and lets an admin change it.
// Going public always asks first: "public" means the whole internet.
export function ProjectVisibility({
  project,
  visibility,
  canChange,
}: {
  project: ProjectRef
  visibility: "private" | "public"
  canChange: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const isPublic = visibility === "public"
  const Icon = isPublic ? Globe : Lock

  function change() {
    startTransition(async () => {
      const result = await setProjectVisibility(project, isPublic ? "private" : "public")
      if ("error" in result) toast.error(result.error)
      else toast.success(isPublic ? "This project is now private." : "This project is now public.")
      setConfirming(false)
    })
  }

  const label = (
    <>
      <Icon className="size-3.5" />
      {isPublic ? "Public: anyone with the link can view" : "Private: only members"}
    </>
  )

  return (
    <>
      {canChange ? (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-xs text-muted-foreground"
          onClick={() => setConfirming(true)}
        >
          {label}
        </Button>
      ) : (
        <p className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground">{label}</p>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isPublic ? "Make this project private?" : "Make this project public?"}</DialogTitle>
            <DialogDescription>
              {isPublic
                ? "Only members of your org will be able to see it. Links people already have will stop working. Its documents will count toward the free plan's private document limit."
                : "Anyone on the internet with a link will be able to read every document in this project, including nested ones and node descriptions. They will not be able to edit. Do not do this for anything confidential."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button variant={isPublic ? "default" : "destructive"} disabled={pending} onClick={change}>
              {isPublic ? "Make private" : "Make public"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
