import { FileText, Link2, Workflow } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { HeroCanvas } from "@/components/landing/hero-canvas"
import { Wordmark } from "@/components/logo"
import { buttonVariants } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

const SOURCE_URL = "https://github.com/subcanvas/subcanvas"

const INSIDE = [
  {
    icon: FileText,
    title: "A page of notes",
    body: "Click a box and write beside it: headings, lists, images, code. The notes open in a side panel, so the drawing stays where it is.",
  },
  {
    icon: Workflow,
    title: "Another whiteboard",
    body: "Double-click to go inside. The box becomes a sheet of its own, with boxes of its own. A trail of tabs shows how deep you are and leads back out.",
  },
  {
    icon: Link2,
    title: "Something that already exists",
    body: "Link the same page from five places. It is one page, not five copies: edit it once, and every place that links to it shows where else it is used.",
  },
]

const USES = [
  ["Plan a move", "Visa, apartment, budget. Each one opens into its own steps."],
  ["Map a system", "Services on top. Inside each, how it works. On each arrow, the contract between them."],
  ["Outline a course", "Weeks as boxes. Readings and notes inside each week."],
  ["Write a story", "Acts, then scenes, then the page itself."],
]

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: orgs } = await supabase.from("orgs").select("slug").order("created_at").limit(1)
    redirect(orgs?.[0] ? `/${orgs[0].slug}` : "/onboarding")
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm">
          <a href="#pricing" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Pricing
          </a>
          <a href={SOURCE_URL} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Source
          </a>
          <Link href="/login" className={buttonVariants({ size: "sm" })}>
            Sign in
          </Link>
        </nav>
      </header>

      <main className="flex flex-col">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pt-10 pb-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pt-16">
          <div className="flex flex-col items-start gap-6">
            <h1 className="text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl">
              A whiteboard where every box opens.
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-graphite">
              Draw the big picture. Then open any box, or any arrow, and find a whole whiteboard or a page of
              notes inside it. Go as deep as the idea goes.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "px-5")}>
                Start drawing
              </Link>
              <p className="text-sm text-graphite">Free for public projects. No card.</p>
            </div>
          </div>
          <HeroCanvas />
        </section>

        <section className="border-y border-rule bg-sheet">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-20">
            <h2 className="max-w-xl text-3xl font-semibold text-balance">What a box can hold</h2>
            <ul className="grid gap-8 md:grid-cols-3">
              {INSIDE.map((item) => (
                <li key={item.title} className="flex flex-col gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-rule bg-paper text-cobalt">
                    <item.icon className="size-4" aria-hidden />
                  </span>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="leading-relaxed text-graphite">{item.body}</p>
                </li>
              ))}
            </ul>
            <p className="max-w-2xl leading-relaxed text-graphite">
              Arrows and groups hold things too. Everyone you invite edits together, live, with cursors. People
              who only need to look can watch for free.
            </p>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-20">
          <h2 className="text-3xl font-semibold">Anything with parts that have parts</h2>
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {USES.map(([title, body]) => (
              <div key={title} className="flex flex-col gap-1 border-t border-rule pt-4">
                <dt className="font-semibold">{title}</dt>
                <dd className="leading-relaxed text-graphite">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="pricing" className="border-t border-rule bg-sheet">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-20">
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold">Pricing</h2>
              <p className="text-graphite">You pay for people who edit private work. Nothing else.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <Plan
                name="Free"
                price="$0"
                points={[
                  "Unlimited public projects",
                  "100 documents in private projects",
                  "3 editors",
                  "Unlimited viewers",
                ]}
              />
              <Plan
                name="Team"
                price="$5"
                unit="per editor, per month"
                highlight
                points={["Unlimited private documents", "Unlimited editors", "Viewers stay free"]}
              />
              <Plan
                name="Run it yourself"
                price="Open source"
                points={["The whole product, AGPL-3.0", "No limits of any kind", "Your server, your data"]}
                action={{ href: SOURCE_URL, label: "Read the source" }}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-graphite">
        <Wordmark className="text-base text-ink" />
        <div className="flex items-center gap-1">
          <a href={SOURCE_URL} className="rounded-md px-2 py-1.5 hover:text-ink">
            GitHub
          </a>
          <a href={`${SOURCE_URL}/blob/main/docs/DEPLOYMENT.md`} className="rounded-md px-2 py-1.5 hover:text-ink">
            Self-hosting
          </a>
          <a href={`${SOURCE_URL}/blob/main/LICENSE`} className="rounded-md px-2 py-1.5 hover:text-ink">
            AGPL-3.0
          </a>
        </div>
      </footer>
    </div>
  )
}

function Plan({
  name,
  price,
  unit,
  points,
  highlight = false,
  action = { href: "/login", label: "Start drawing" },
}: {
  name: string
  price: string
  unit?: string
  points: string[]
  highlight?: boolean
  action?: { href: string; label: string }
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 rounded-xl border bg-paper p-6",
        highlight ? "border-cobalt" : "border-rule"
      )}
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-xs tracking-wide text-graphite uppercase">{name}</h3>
        <p className="font-heading text-3xl font-semibold">{price}</p>
        <p className="min-h-5 text-sm text-graphite">{unit}</p>
      </div>
      <ul className="flex flex-1 flex-col gap-2 text-sm">
        {points.map((point) => (
          <li key={point} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-cobalt" />
            {point}
          </li>
        ))}
      </ul>
      <a href={action.href} className={buttonVariants({ variant: highlight ? "default" : "outline" })}>
        {action.label}
      </a>
    </div>
  )
}
