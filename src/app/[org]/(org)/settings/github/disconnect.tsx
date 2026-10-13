"use client"

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

import { disconnectGitHub } from "./actions"

// Disconnecting stops imports from that account here. Projects already
// imported stay as they are; the app stays installed on GitHub until it is
// uninstalled there, which the dialog links to.
export function DisconnectGitHub({
  slug,
  orgId,
  installationId,
  login,
  settingsUrl,
}: {
  slug: string
  orgId: string
  installationId: number
  login: string
  settingsUrl: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function disconnect() {
    startTransition(async () => {
      const result = await disconnectGitHub(slug, orgId, installationId)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setOpen(false)
      toast.success(`Disconnected ${login}.`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={pending}>
            Disconnect
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect {login}?</DialogTitle>
          <DialogDescription>
            This workspace will no longer import from {login}. Projects already imported stay as they are. The app
            stays installed on GitHub until you{" "}
            <a href={settingsUrl} target="_blank" rel="noreferrer" className="font-medium text-ink underline underline-offset-4">
              uninstall it there
            </a>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button variant="destructive" onClick={disconnect} disabled={pending}>
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
