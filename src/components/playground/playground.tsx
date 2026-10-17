"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { Wordmark } from "@/components/logo"
import { ProjectAddresses, type AddressEntry } from "@/components/project-addresses"
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
import { DocumentStoreProvider } from "@/lib/documents/store"
import { EXAMPLES, exampleAt, type PlaygroundExample } from "@/lib/playground/examples"
import { codeOf, openPlayground, type PlaygroundIndex } from "@/lib/playground/local-store"
import type { PlaygroundSeed } from "@/lib/playground/seed"

// The playground (app/try): the real whiteboard and pages, with no account
// and no server. Everything is kept in this browser (lib/playground), and
// opens on an example: a system design the import drew (/try), or a course
// (/try/productivity). It is a place to try things, so it says plainly that
// nothing here is saved anywhere else.

// An example's documents' addresses are /try/<project>/<title>-<code>, like
// a project's.
export const playgroundProject = (example: PlaygroundExample) => ({
  slug: "try",
  project: example.project,
  orgId: "playground",
  projectId: "playground",
})

const IndexContext = createContext<{ index: PlaygroundIndex; example: PlaygroundExample } | null>(null)

export function usePlayground() {
  const opened = use(IndexContext)
  if (!opened) throw new Error("usePlayground needs the Playground above it.")
  return opened
}

// Each example opened once per page load, however often the effect below
// runs: two first visits at once would copy the example in twice.
const opening = new Map<string, Promise<PlaygroundIndex>>()

const loadSeed = (example: PlaygroundExample) => async (): Promise<PlaygroundSeed> => {
  const response = await fetch(example.seed)
  if (!response.ok) throw new Error(`The example could not be loaded (${response.status}).`)
  return response.json()
}

export function Playground({ children }: { children: React.ReactNode }) {
  const example = exampleAt(usePathname())
  // A new example is a new project: everything below opens again.
  return (
    <Example key={example.key} example={example}>
      {children}
    </Example>
  )
}

function Example({ example, children }: { example: PlaygroundExample; children: React.ReactNode }) {
  const [index, setIndex] = useState<PlaygroundIndex | null>(null)
  const [failed, setFailed] = useState(false)
  const other = example.key === "shop" ? EXAMPLES.productivity : EXAMPLES.shop

  useEffect(() => {
    if (!opening.has(example.key)) opening.set(example.key, openPlayground(loadSeed(example), example.storage))
    opening.get(example.key)!.then(setIndex, () => setFailed(true))
  }, [example])

  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-rule bg-sheet px-4 py-2">
        <Wordmark className="text-base text-ink" />
        <p className="min-w-0 truncate text-sm text-graphite max-sm:hidden">
          Playground. Everything here stays in this browser.
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link href={other.home} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            See {other.about}
          </Link>
          {index && <StartOver index={index} home={example.home} />}
          <Link href="/login" className={buttonVariants({ size: "sm" })}>
            Sign up free
          </Link>
        </div>
      </header>
      {failed ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="font-heading text-xl font-semibold">The playground could not open</p>
          <p className="max-w-sm text-sm text-graphite">
            It keeps its work in this browser&apos;s storage, which may be turned off here (a private window
            can do that). Try another window, or sign up and use Subcanvas itself.
          </p>
        </main>
      ) : index ? (
        <Opened index={index} example={example}>
          {children}
        </Opened>
      ) : (
        <p role="status" className="sr-only">
          Loading…
        </p>
      )}
    </div>
  )
}

function Opened({
  index,
  example,
  children,
}: {
  index: PlaygroundIndex
  example: PlaygroundExample
  children: React.ReactNode
}) {
  // Every title the addresses need, read again whenever one changes.
  const version = useSyncExternalStore(index.store.subscribe!, index.version, () => 0)
  const documents = useMemo<AddressEntry[]>(
    () => index.documents().map((entry) => [entry.id, codeOf(entry.id), entry.title]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, version]
  )
  return (
    <IndexContext value={{ index, example }}>
      <DocumentStoreProvider value={index.store}>
        <ProjectAddresses project={playgroundProject(example)} documents={documents}>
          {children}
        </ProjectAddresses>
      </DocumentStoreProvider>
    </IndexContext>
  )
}

function StartOver({ index, home }: { index: PlaygroundIndex; home: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm">Start over</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start over?</DialogTitle>
          <DialogDescription>
            Everything you changed in the playground is deleted, and the example comes back as it was.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => {
              index.startOver()
              // A full load, not a client navigation: the open documents
              // must close before their databases can be deleted.
              window.location.assign(home)
            }}
          >
            Delete and start over
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
