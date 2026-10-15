"use client"

import Link from "next/link"
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
import { codeOf, openPlayground, type PlaygroundIndex } from "@/lib/playground/local-store"
import type { PlaygroundSeed } from "@/lib/playground/seed"

// The playground (app/try): the real whiteboard and pages, with no account
// and no server. Everything is kept in this browser (lib/playground), and
// opens on an example the import drew. It is a place to try things, so it
// says plainly that nothing here is saved anywhere else.

// Its documents' addresses are /try/shop/<title>-<code>, like a project's.
export const PLAYGROUND_PROJECT = { slug: "try", project: "shop", orgId: "playground", projectId: "playground" }

const IndexContext = createContext<PlaygroundIndex | null>(null)

export function usePlayground() {
  const index = use(IndexContext)
  if (!index) throw new Error("usePlayground needs the Playground above it.")
  return index
}

// Opened once per page load, however often the effect below runs: two
// first visits at once would copy the example in twice.
let opening: Promise<PlaygroundIndex> | null = null

const loadSeed = async (): Promise<PlaygroundSeed> => {
  const response = await fetch("/api/playground/seed")
  if (!response.ok) throw new Error(`The example could not be loaded (${response.status}).`)
  return response.json()
}

export function Playground({ children }: { children: React.ReactNode }) {
  const [index, setIndex] = useState<PlaygroundIndex | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    opening ??= openPlayground(loadSeed)
    opening.then(setIndex, () => setFailed(true))
  }, [])

  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-rule bg-sheet px-4 py-2">
        <Wordmark className="text-base text-ink" />
        <p className="min-w-0 truncate text-sm text-graphite max-sm:hidden">
          Playground. Everything here stays in this browser.
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {index && <StartOver index={index} />}
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
        <Opened index={index}>{children}</Opened>
      ) : (
        <p role="status" className="sr-only">
          Loading…
        </p>
      )}
    </div>
  )
}

function Opened({ index, children }: { index: PlaygroundIndex; children: React.ReactNode }) {
  // Every title the addresses need, read again whenever one changes.
  const version = useSyncExternalStore(index.store.subscribe!, index.version, () => 0)
  const documents = useMemo<AddressEntry[]>(
    () => index.documents().map((entry) => [entry.id, codeOf(entry.id), entry.title]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, version]
  )
  return (
    <IndexContext value={index}>
      <DocumentStoreProvider value={index.store}>
        <ProjectAddresses project={PLAYGROUND_PROJECT} documents={documents}>
          {children}
        </ProjectAddresses>
      </DocumentStoreProvider>
    </IndexContext>
  )
}

function StartOver({ index }: { index: PlaygroundIndex }) {
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
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/try")
            }}
          >
            Delete and start over
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
