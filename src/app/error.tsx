"use client"

import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
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
