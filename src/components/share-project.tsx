"use client"

import { Check, Code, Copy, EyeOff, Globe, Lock } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { embedSnippet } from "@/lib/embed"
import { publicProjectPath } from "@/lib/public-route"

// Who can see the project, in one place: the button says it, the popover
// holds the link and lets an admin change it. Going public always asks
// first: "public" means the whole internet.
//
// On a whiteboard's page it is given that whiteboard, and once the project
// is public it also offers the snippet that embeds it in a README.
//
// A project the operator took down (`takenDown`) is public to nobody,
// whatever its setting, so it offers no link and says whom to write to.
export function ShareProject({
  project,
  visibility,
  canChange,
  whiteboard,
  takenDown = null,
}: {
  project: ProjectRef
  visibility: "private" | "public"
  canChange: boolean
  whiteboard?: { docId: string; title: string }
  takenDown?: { contact: string | null } | null
}) {
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState<"link" | "embed" | null>(null)
  const [pending, startTransition] = useTransition()
  const isPublic = visibility === "public"
  const Icon = takenDown ? EyeOff : isPublic ? Globe : Lock
  const link =
    typeof window === "undefined" ? "" : `${window.location.origin}${publicProjectPath(project.projectId)}`

  function change() {
    startTransition(async () => {
      const result = await setProjectVisibility(project, isPublic ? "private" : "public")
      if ("error" in result) toast.error(result.error)
      else toast.success(isPublic ? "This project is now private." : "This project is now public.")
      setConfirming(false)
    })
  }

  async function copy(what: "link" | "embed", text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // The browser refused (no permission, or the page is not focused):
      // say so instead of leaving the button looking as if nothing happened.
      toast.error("Could not reach the clipboard. Select the text and copy it yourself.")
      return
    }
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <>
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm">
              <Icon />
              Share
            </Button>
          }
        />
        <PopoverContent align="end" className="w-80">
          {takenDown ? (
            <TakenDown projectId={project.projectId} contact={takenDown.contact} />
          ) : (
            <PopoverHeader>
              <PopoverTitle>{isPublic ? "Public project" : "Private project"}</PopoverTitle>
              <PopoverDescription>
                {isPublic
                  ? "Anyone with the link can view every document in it. Only members can edit."
                  : "Only members of your org can see it."}
              </PopoverDescription>
            </PopoverHeader>
          )}
          {isPublic && !takenDown && (
            <div className="flex gap-1.5">
              <Input
                readOnly
                aria-label="Public link"
                value={link}
                className="h-8 font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button variant="outline" size="sm" onClick={() => copy("link", link)}>
                {copied === "link" ? <Check /> : <Copy />}
                {copied === "link" ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
          {isPublic && !takenDown && whiteboard && (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xs text-muted-foreground">
                A picture for a README that stays current.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copy(
                    "embed",
                    embedSnippet({ origin: window.location.origin, projectId: project.projectId, ...whiteboard })
                  )
                }
              >
                {copied === "embed" ? <Check /> : <Code />}
                {copied === "embed" ? "Copied" : "Copy embed"}
              </Button>
            </div>
          )}
          {/* While taken down, making it public would change nothing. */}
          {canChange ? (
            (isPublic || !takenDown) && (
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => setConfirming(true)}>
                {isPublic ? <Lock /> : <Globe />}
                {isPublic ? "Make private" : "Make public"}
              </Button>
            )
          ) : (
            !isPublic && !takenDown && <p className="text-xs text-muted-foreground">An admin can make it public.</p>
          )}
        </PopoverContent>
      </Popover>

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

function TakenDown({ projectId, contact }: { projectId: string; contact: string | null }) {
  return (
    <PopoverHeader>
      <PopoverTitle>Taken down</PopoverTitle>
      <PopoverDescription>
        Whoever runs this server has taken this project down. Its public link shows nothing, whatever the
        setting here. Members can still open and edit it.
      </PopoverDescription>
      <PopoverDescription>
        {contact ? (
          <>
            To ask why, or to ask for it back, email{" "}
            <a
              className="font-medium text-cobalt underline underline-offset-4"
              href={`mailto:${contact}?subject=${encodeURIComponent(`Taken-down project ${projectId}`)}`}
            >
              {contact}
            </a>
            .
          </>
        ) : (
          "To ask why, or to ask for it back, write to whoever runs this server."
        )}
      </PopoverDescription>
    </PopoverHeader>
  )
}
