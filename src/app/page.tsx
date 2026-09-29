import { FileText, Link2, Workflow } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { HeroCanvas } from "@/components/landing/hero-canvas"
import { Wordmark } from "@/components/logo"
import { buttonVariants } from "@/components/ui/button"
import { billingConfigured } from "@/lib/billing/stripe"
import { WORKSPACE_HOME } from "@/lib/home"
import { legalDetails } from "@/lib/legal"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

const SOURCE_URL = "https://github.com/subcanvas/subcanvas"

export const metadata: Metadata = {
  title: { absolute: "Subcanvas: turn a GitHub repo into a diagram you can click into" },
}

const INSIDE = [
  {
    icon: FileText,
    title: "A page of notes",
    body: "Click a box and write beside it: headings, lists, images, code. The notes open in a side panel, so the drawing stays where it is.",
  },
  {
    icon: Workflow,
    title: "Another whiteboard",
    body: "Double-click to go inside. The box becomes a whiteboard of its own, with boxes of its own. A trail of tabs shows how deep you are and leads back out.",
  },
  {
    icon: Link2,
    title: "Something that already exists",
    body: "Link the same page from five places. It is one page, not five copies: edit it once, and every place that links to it shows where else it is used.",
  },
]

const DEVELOPER_STEPS = [
  ["Paste a repository.", "Public repositories only. There's no GitHub app to install."],
  ["Get the boxes.", "One for each main folder, with its path under the name and its README beside the drawing."],
  [
    "Say what connects.",
    "Add a .subcanvas file to a folder to name what it talks to. Each connection becomes an arrow, drawn where the two folders meet, and its description becomes the page behind the arrow.",
  ],
  [
    "Put it in your README.",
    "A public diagram embeds as a picture that follows your edits within minutes and links to the live version. The import is a one-time copy: later commits don't change it.",
  ],
] as const

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

  // The same page for everyone. Someone signed in gets a way to their own
  // work in place of Sign in, and the buttons that would ask them to sign in
  // take them there instead.
  const start = user ? WORKSPACE_HOME : "/login"

  // Without Stripe there is no plan to buy, so the page shows what this
  // server actually offers instead of a price nobody can pay.
  const selling = billingConfigured()

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm">
          <a href="#developers" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-sm:hidden")}>
            Developers
          </a>
          <a href="#pricing" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Pricing
          </a>
          <a href={SOURCE_URL} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-sm:hidden")}>
            Source
          </a>
          <Link href={start} className={buttonVariants({ size: "sm" })}>
            {user ? "Your projects" : "Sign in"}
          </Link>
        </nav>
      </header>

      <main id="main" className="flex flex-col">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pt-10 pb-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pt-16">
          <div className="flex flex-col items-start gap-6">
            <h1 className="text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl">
              Turn a GitHub repo into a diagram you can click into.
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-graphite">
              Paste a public repository. Each main folder becomes a box with its README inside, and a box opens
              into the folders within it. Then draw the rest: any box or arrow can hold its own whiteboard or a
              page of notes.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={start} className={cn(buttonVariants({ size: "lg" }), "px-5")}>
                Import a repository
              </Link>
              <Link href={start} className={buttonVariants({ variant: "ghost", size: "lg" })}>
                Or start blank
              </Link>
            </div>
            <p className="text-sm text-graphite">
              {selling ? "Free, private projects included. No card." : "Free while Subcanvas is this new. No card."}
            </p>
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
            <p className="max-w-2xl leading-relaxed text-graphite">
              Bring your notes from Notion, Obsidian, or a folder of Markdown. And connect an AI agent (Claude
              Code, Codex, Cursor, or anything else that speaks MCP) to read and edit your whiteboards as you,
              with your permissions.
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

        <section id="developers" className="border-t border-rule">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 lg:grid-cols-2 lg:items-center">
            <div className="flex flex-col gap-5">
              <p className="font-mono text-xs tracking-wide text-graphite uppercase">For developers</p>
              <h2 className="text-3xl font-semibold">From a repository to a diagram</h2>
              <p className="max-w-xl leading-relaxed text-graphite">
                Import a public GitHub repository and start from its structure: a box for each main folder (up to
                60), each folder&apos;s README inside its box, and folders inside folders as whiteboards inside
                boxes. Arrows come from .subcanvas files, where the repository has them. Then make it yours: move
                things, delete what isn&apos;t part of the design, draw what&apos;s missing.
              </p>
              <ol className="flex max-w-xl flex-col gap-3 text-sm leading-relaxed">
                {DEVELOPER_STEPS.map(([title, body], index) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-rule font-mono text-[11px] text-graphite">
                      {index + 1}
                    </span>
                    <span>
                      <span className="font-semibold">{title}</span>{" "}
                      <span className="text-graphite">{body}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={start} className={buttonVariants()}>
                  Import a repository
                </Link>
                <a
                  href={`${SOURCE_URL}/blob/main/docs/SUBCANVAS_FILE.md`}
                  className={buttonVariants({ variant: "ghost" })}
                >
                  The .subcanvas file
                </a>
              </div>
            </div>
            <pre
              aria-label="An example .subcanvas file"
              className="sheet-stack overflow-x-auto rounded-xl border border-rule bg-sheet p-5 font-mono text-[13px] leading-relaxed text-graphite [--stack-edge:var(--blueline)]"
            >
              <code>
                <span className="text-graphite"># services/payments/.subcanvas{"\n"}</span>
                <span className="text-ink">title</span>: Payments{"\n"}
                <span className="text-ink">description</span>: Charges cards and reconciles payouts.{"\n"}
                <span className="text-ink">connects</span>:{"\n"}
                {"  "}- <span className="text-ink">to</span>: services/ledger{"\n"}
                {"    "}<span className="text-ink">label</span>: gRPC{"\n"}
                {"    "}<span className="text-ink">description</span>: Posts a journal entry{"\n"}
                {"      "}for every settled charge.
              </code>
            </pre>
          </div>
        </section>

        <section id="pricing" className="border-t border-rule bg-sheet">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-20">
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold">Pricing</h2>
              <p className="text-graphite">
                {selling
                  ? "Free until your workspace needs a fourth editor or more private work. Then $5 a month for each editor. Viewers are always free."
                  : "Nothing to pay yet. There is no paid plan while Subcanvas is this new."}
              </p>
            </div>
            <div className={cn("grid gap-6", selling ? "md:grid-cols-3" : "md:grid-cols-2")}>
              {selling ? (
                <>
                  <Plan
                    start={start}
                    name="Free"
                    price="$0"
                    points={[
                      "Unlimited public projects",
                      "100 private whiteboards and pages (a box's notes don't count)",
                      "Up to 3 editors, you included",
                      "Unlimited viewers",
                      "1 GB of pictures and videos",
                    ]}
                  />
                  <Plan
                    start={start}
                    name="Pro"
                    price="$5"
                    unit="per editor, per month"
                    highlight
                    points={[
                      "Unlimited private whiteboards and pages",
                      "As many editors as you need",
                      "Viewers stay free",
                      "100 GB of pictures and videos",
                    ]}
                  />
                </>
              ) : (
                <Plan
                  start={start}
                  name="Hosted"
                  price="Free"
                  unit="while Subcanvas is this new"
                  highlight
                  points={[
                    "Public and private projects alike",
                    "As many editors and viewers as you like",
                    "1 GB of pictures and videos per workspace",
                    "A paid plan comes later, and this work stays yours",
                  ]}
                />
              )}
              <Plan
                start={start}
                name="Run it yourself"
                price="Open source"
                points={["The whole product, AGPL-3.0", "No plan limits", "Your server, your data"]}
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
          {legalDetails() && (
            <>
              <Link href="/terms" className="rounded-md px-2 py-1.5 hover:text-ink">
                Terms
              </Link>
              <Link href="/privacy" className="rounded-md px-2 py-1.5 hover:text-ink">
                Privacy
              </Link>
            </>
          )}
        </div>
      </footer>
    </div>
  )
}

function Plan({
  start,
  name,
  price,
  unit,
  points,
  highlight = false,
  action = { href: start, label: "Start drawing" },
}: {
  start: string
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
