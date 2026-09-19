import Link from "next/link"

import { AuthShell } from "@/components/auth-shell"
import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <AuthShell>
      <div className="flex flex-col items-start gap-3 rounded-xl border border-rule bg-sheet p-6">
        <p className="font-mono text-xs tracking-wide text-graphite uppercase">Not found</p>
        <h1 className="text-2xl font-semibold">There is no sheet here</h1>
        <p className="text-sm leading-relaxed text-graphite">
          It may have been moved to the trash, made private, or the link may be wrong. If someone shared it
          with you, ask them to check that you have access.
        </p>
        <Link href="/" className={buttonVariants()}>
          Go to your projects
        </Link>
      </div>
    </AuthShell>
  )
}
