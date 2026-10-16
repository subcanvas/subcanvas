"use client"

import { Autocomplete } from "@base-ui/react/autocomplete"
import { FolderGit2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"

import { LimitRefusal } from "@/components/limit-refusal"
import { GitHubIcon } from "@/components/provider-icons"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"

import { gitHubChoices, importFromGitHub, openedGitHubImport, type GitHubChoices, type ImportState } from "./actions"

type RepositoryChoice = GitHubChoices["repositories"][number]

// Draws a GitHub repository as a project: a node for each of its main
// folders, its README inside each. See docs/SUBCANVAS_FILE.md. A public
// repository, or one the workspace's GitHub connections can read, which the
// field offers as you type (Connect GitHub, Settings → GitHub).
// `canPublish`: an admin or owner, who may make the project public.
// `privateLimit`: the limit on private documents, when there is one.
// `resume`: the repository to open on, and the GitHub account just
// connected, when Connect GitHub brings someone back to the import they set
// out from (api/github/callback).
export function ImportProject({
  slug,
  canPublish,
  privateLimit,
  resume = null,
}: {
  slug: string
  canPublish: boolean
  privateLimit: number | null
  resume?: { repository: string; connected: string | null } | null
}) {
  const router = useRouter()
  // An import that stops to show its notes leaves the page behind the dialog
  // as it was (see importFromGitHub), so it is refreshed once the dialog
  // closes, to list the new project.
  const stale = useRef(false)

  return (
    <Dialog
      defaultOpen={resume !== null}
      onOpenChange={(open) => {
        // For the step record. Nothing waits on it.
        if (open) void openedGitHubImport()
        // The address that opened it on a repository has done its job.
        if (!open && resume) router.replace(`/${slug}`)
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
          resume={resume}
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
  resume,
  onNotes,
}: {
  slug: string
  canPublish: boolean
  privateLimit: number | null
  resume: { repository: string; connected: string | null } | null
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
  const [repository, setRepository] = useState(resume?.repository ?? "")
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
  // Connect GitHub from here: GitHub's install page, then back to this
  // dialog on the same repository (api/github/connect and callback).
  const typed = reference ? `${reference.owner}/${reference.name}` : null
  const connectHref = `/api/github/connect?workspace=${encodeURIComponent(slug)}${typed ? `&repository=${encodeURIComponent(typed)}` : ""}`
  // A repository GitHub would not show without a connection, or a
  // connection that stopped working: connecting is the way forward.
  const refusal = state && "error" in state ? state : null
  const connectHelps =
    !!choices?.connectable && !!refusal && (refusal.reason === "not_found" || refusal.reason === "unavailable")

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
        {/* Suggests what the workspace's GitHub connections can read, in a
            list drawn here: a browser's own (a <datalist>) is unstyled and,
            on some, tiny. Anything else can still be typed or pasted. */}
        <Autocomplete.Root
          items={choices?.repositories ?? []}
          value={repository}
          onValueChange={setRepository}
          itemToStringValue={(choice: RepositoryChoice) => choice.repository}
        >
          <Autocomplete.Input
            render={
              <Input
                id="import-repository"
                name="repository"
                required
                maxLength={300}
                autoFocus
                spellCheck={false}
                disabled={pending}
                placeholder="facebook/react, or its GitHub address"
                className="font-mono text-[13px]"
                aria-describedby={choices?.connectable ? "import-repository-detail" : undefined}
              />
            }
          />
          {choices?.repositories.length ? (
            <Autocomplete.Portal>
              <Autocomplete.Positioner sideOffset={4} className="isolate z-50">
                <Autocomplete.Popup className="max-h-[min(var(--available-height),18rem)] w-(--anchor-width) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-empty:hidden">
                  <Autocomplete.List>
                    {(choice: RepositoryChoice) => (
                      <Autocomplete.Item
                        key={choice.repository}
                        value={choice}
                        className="flex cursor-default items-center gap-3 rounded-md px-2 py-1.5 outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{choice.repository}</span>
                        <span className="shrink-0 text-xs text-graphite">{choice.private ? "Private" : "Public"}</span>
                      </Autocomplete.Item>
                    )}
                  </Autocomplete.List>
                </Autocomplete.Popup>
              </Autocomplete.Positioner>
            </Autocomplete.Portal>
          ) : null}
        </Autocomplete.Root>
        {choices?.connectable && (
          <p id="import-repository-detail" className="text-xs leading-relaxed text-graphite">
            {choices.repositories.length
              ? "Start typing to choose from the repositories this workspace's GitHub connections can read. "
              : "To import a private repository, connect the GitHub account that owns it. "}
            {choices.broken.length > 0 &&
              `The connection to ${choices.broken.join(" and ")} no longer works and needs connecting again. `}
            {choices.canConnect ? (
              choices.repositories.length || choices.broken.length ? (
                <Link href={settingsHref} className="font-medium text-ink underline underline-offset-4">
                  Manage GitHub connections
                </Link>
              ) : (
                <a href={connectHref} className="font-medium text-ink underline underline-offset-4">
                  Connect GitHub
                </a>
              )
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

      {resume?.connected && !refusal && (
        <p role="status" className="text-sm leading-relaxed text-graphite">
          Connected to GitHub as {resume.connected}. Import the repository now.
        </p>
      )}

      {refusal && <LimitRefusal refused={refusal} />}
      {connectHelps &&
        (choices?.canConnect ? (
          <a href={connectHref} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
            <GitHubIcon />
            Connect GitHub{typed ? ` to import ${typed}` : ""}
          </a>
        ) : (
          <p className="text-xs leading-relaxed text-graphite">
            Ask an admin of this workspace to connect GitHub. Then the import can read private repositories.
          </p>
        ))}

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
