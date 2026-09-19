"use client"

import { FolderGit2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { importFromGitHub } from "./actions"

// Draws a public GitHub repository as a project: a node per folder, its
// README inside each. See docs/ROADMAP.md, section 3.
export function ImportProject({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(importFromGitHub.bind(null, slug), null)
  const imported = state && "ok" in state ? state : null
  // Held here because a form clears itself after its action runs, and after
  // a typo the name is what the person wants to fix.
  const [repository, setRepository] = useState("")

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline">
            <FolderGit2 />
            Import from GitHub
          </Button>
        }
      />
      <DialogContent>
        {imported ? (
          // Shown only when something was left out. A clean import goes
          // straight to the whiteboard.
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Imported, with notes</DialogTitle>
              <DialogDescription>
                {imported.folders} {imported.folders === 1 ? "folder is" : "folders are"} on the
                diagram. Before you look:
              </DialogDescription>
            </DialogHeader>
            <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-lg border border-rule bg-paper p-3 text-xs leading-relaxed text-graphite">
              {imported.warnings.map((warning) => (
                <li key={warning} className="break-words">
                  {warning}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button nativeButton={false} render={<Link href={imported.href} />}>Open the whiteboard</Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Import from GitHub</DialogTitle>
              <DialogDescription>
                A public repository becomes a project: one node per folder, each folder&apos;s README
                inside its node, and folders inside folders as whiteboards inside nodes.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <Label htmlFor="import-repository">Repository</Label>
              <Input
                id="import-repository"
                name="repository"
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                required
                maxLength={300}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
                placeholder="owner/name, or the address of its page"
                className="font-mono text-[13px]"
              />
            </div>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="public"
                defaultChecked
                disabled={pending}
                className="mt-0.5 size-4 shrink-0 accent-cobalt"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Make this project public (the repository already is)</span>
                <span className="text-xs leading-relaxed text-graphite">
                  Anyone with the link can read it. Only members can edit. Public documents are
                  unlimited on the free plan.
                </span>
              </span>
            </label>

            {state && "error" in state && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}

            <DialogFooter className="items-center">
              {pending && (
                <p role="status" className="mr-auto text-xs text-graphite">
                  Reading folders and READMEs. A large repository takes up to a minute.
                </p>
              )}
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {pending ? "Importing…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
