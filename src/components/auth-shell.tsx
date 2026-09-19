import Link from "next/link"

import { Wordmark } from "@/components/logo"

// The frame for pages outside the app: sign in, create an org, accept an
// invite. One sheet on the drafting paper, with the mark above it.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12"
      style={{
        backgroundImage: "radial-gradient(var(--blueline) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <Link href="/" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Wordmark className="text-xl" />
      </Link>
      <div className="sheet-stack w-full max-w-sm rounded-xl [--stack-edge:var(--blueline)] [--stack-offset:5px]">
        {children}
      </div>
    </main>
  )
}
