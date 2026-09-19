import Link from "next/link"

import { Wordmark } from "@/components/logo"
import { LEGAL_EFFECTIVE } from "@/lib/legal"

// The frame for the Terms and the Privacy Policy: one readable column.
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-sheet">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wordmark className="text-lg" />
        </Link>
        <nav aria-label="Legal" className="flex gap-4 text-sm text-graphite">
          <Link href="/terms" className="rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
            Terms
          </Link>
          <Link href="/privacy" className="rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
            Privacy
          </Link>
        </nav>
      </header>
      <main
        id="main"
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 pt-8 pb-24 text-[15px] leading-relaxed text-ink [&_a]:text-cobalt [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:mt-8 [&_h2]:font-sans [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-normal [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5"
      >
        <h1 className="text-4xl font-semibold">{title}</h1>
        <p className="text-sm text-graphite">Effective {LEGAL_EFFECTIVE}</p>
        {children}
      </main>
    </div>
  )
}
