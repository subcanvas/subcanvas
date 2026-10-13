"use client"

import { FolderGit2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"

import { LimitRefusal } from "@/components/limit-refusal"
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
import { parseRepositoryReference } from "@/lib/github/reference"

import { gitHubChoices, importFromGitHub, openedGitHubImport, type GitHubChoices, type ImportState } from "./actions"

// Draws a GitHub repository as a project: a node for each of its main
// folders, its README inside each. See docs/SUBCANVAS_FILE.md. A public
// repository, or one the workspace's GitHub connections can read, which the
// field offers as you type (Connect GitHub, Settings → GitHub).
// `canPublish`: an admin or owner, who may make the project public.
// `privateLimit`: the limit on private documents, when there is one.
export function ImportProject({
  slug,
  canPublish,
  privateLimit,
}: {
  slug: string
  canPublish: boolean
  privateLimit: number | null
}) {
  const router = useRouter()
  // An import that stops to show its notes leaves the page behind the dialog
  // as it was (see importFromGitHub), so it is refreshed once the dialog
  // closes, to list the new project.
  const stale = useRef(false)

  return (
    <Dialog
      onOpenChange={(open) => {
        // For the step record. Nothing waits on it.
        if (open) void openedGitHubImport()
        if (open || !stale.current) return
        stale.current = false
        router.refresh()
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <FolderGit2 />
            Import from GitHub
          </Button>
        }
      />
      <DialogContent>
        <ImportSteps
          slug={slug}
          canPublish={canPublish}
          privateLimit={privateLimit}
          onNotes={() => (stale.current = true)}
        />
      </DialogContent>
    </Dialog>
  )
}

// The form, then the notes if there are any. The dialog mounts it each time
// it opens, so it always opens on the form.
function ImportSteps({
  slug,
  canPublish,
  privateLimit,
  onNotes,
}: {
  slug: string
  canPublish: boolean
  privateLimit: number | null
  onNotes: () => void
}) {
  const [state, action, pending] = useActionState(async (previous: ImportState, formData: FormData) => {
    const next = await importFromGitHub(slug, previous, formData)
    if (next && "ok" in next) onNotes()
    return next
  }, null)
  const imported = state && "ok" in state ? state : null
  // Held here because a form clears itself after its action runs, and after
  // a typo the name is what the person wants to fix.
  const [repository, setRepository] = useState("")
  // Asked for each time the dialog opens, so a connection made since shows.
  const [choices, setChoices] = useState<GitHubChoices | null>(null)
  useEffect(() => {
    let current = true
    gitHubChoices(slug)
      .then((found) => current && setChoices(found))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [slug])
  const reference = parseRepositoryReference(repository.trim())
  const chosen = reference
    ? choices?.repositories.find(
        (candidate) => candidate.repository.toLowerCase() === `${reference.owner}/${reference.name}`.toLowerCase()
      )
    : undefined
  const settingsHref = `/${slug}/settings/github`

  return imported ? (
    // Shown only when something was left out. A clean import goes
    // straight to the whiteboard.
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Imported, with a few things left out</DialogTitle>
        <DialogDescription>
          {imported.folders} {imported.folders === 1 ? "folder is" : "folders are"} on the
          diagram. Left out:
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
        <Button nativeButton={false} render={<Link href={imported.href} />}>Open the diagram</Button>
      </DialogFooter>
    </div>
  ) : (
    <form action={action} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Import from GitHub</DialogTitle>
        <DialogDescription>
          {choices?.connectable
            ? "A public repository, or a private one from a GitHub account this workspace has connected, becomes a project."
            : "A public repository becomes a project."}{" "}
          Each main folder becomes a box with its README inside, and a folder with folders of its
          own opens into another whiteboard. Arrows come from .subcanvas files, where the
          repository has them.
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
          placeholder="facebook/react, or its GitHub address"
          className="font-mono text-[13px]"
          list={choices?.repositories.length ? "import-repositories" : undefined}
          aria-describedby={choices?.connectable ? "import-repository-detail" : undefined}
        />
        {choices?.repositories.length ? (
          <datalist id="import-repositories">
            {choices.repositories.map((choice) => (
              <option key={choice.repository} value={choice.repository}>
                {choice.private ? "Private" : "Public"}
              </option>
            ))}
          </datalist>
        ) : null}
        {choices?.connectable && (
          <p id="import-repository-detail" className="text-xs leading-relaxed text-graphite">
            {choices.repositories.length
              ? "Start typing to choose from the repositories this workspace's GitHub connections can read. "
              : "To import a private repository, connect the GitHub account that owns it. "}
            {choices.broken.length > 0 &&
              `The connection to ${choices.broken.join(" and ")} no longer works and needs connecting again. `}
            {choices.canConnect ? (
              <Link href={settingsHref} className="font-medium text-ink underline underline-offset-4">
                {choices.repositories.length || choices.broken.length ? "Manage GitHub connections" : "Connect GitHub"}
              </Link>
            ) : (
              "An admin can do that in Settings."
            )}
          </p>
        )}
      </div>

      {/* Public by default for whoever may publish, since the repository
          already is; an agent's import gets the same (lib/github/import-reference).
          A private repository always makes a private project, so it has no choice. */}
      {chosen?.private ? (
        <p className="text-sm leading-relaxed text-graphite">
          This repository is private, so the project will be private too: only members of this workspace can open it.
          {privateLimit != null &&
            ` Each README and each whiteboard inside a box counts toward the limit of ${privateLimit} private documents.`}
        </p>
      ) : (
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="public"
            defaultChecked={canPublish}
            disabled={pending || !canPublish}
            aria-describedby="import-public-detail"
            className="mt-0.5 size-4 shrink-0 accent-cobalt disabled:opacity-50"
          />
          <span className="flex flex-col gap-0.5">
            <span className={canPublish ? "font-medium" : "font-medium text-graphite"}>
              Make this project public (the repository already is)
            </span>
            <span id="import-public-detail" className="text-xs leading-relaxed text-graphite">
              {canPublish
                ? "Anyone with the link can read it. Only members can edit."
                : "Only an admin can make a project public, so this one will be private."}
              {privateLimit != null &&
                ` ${canPublish ? "Unticked, each" : "Each"} README and each whiteboard inside a box counts toward the limit of ${privateLimit} private documents.`}
            </span>
          </span>
        </label>
      )}

      {state && "error" in state && <LimitRefusal refused={state} />}

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
  )
}
