"use client"

import { useEffect } from "react"

import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { reportError } from "@/lib/errors/report"

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // An error with a digest happened on the server, which has reported it
  // already (instrumentation.ts); the browser reports only its own.
  useEffect(() => {
    if (!error.digest) reportError(error)
  }, [error])

  return (
    <AuthShell>
      <div className="flex flex-col items-start gap-3 rounded-xl border border-rule bg-sheet p-6">
        <p className="font-mono text-xs tracking-wide text-destructive uppercase">Something broke</p>
        <h1 className="text-2xl font-semibold">This page could not load</h1>
        <p className="text-sm leading-relaxed text-graphite">
          Nothing you wrote is lost: documents save as you type. Try again, and if it keeps happening, reload
          the page.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </AuthShell>
  )
}
