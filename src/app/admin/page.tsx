import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Wordmark } from "@/components/logo"
import { createClient } from "@/lib/supabase/server"
import { COLORS } from "@/lib/whiteboard/colors"

import { LocalTime } from "./local-time"

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } }

// The operator's dashboard: how many accounts there are, how far each got,
// and what went wrong this week. All of it comes from the step record and
// the error reports (migration operator_dashboard), the same as the daily
// summary email; nothing is anyone's content. Only an operator gets it
// (private.operators); everyone else gets "not found", as if nothing were
// here. The operator's own account is left out of every number.

type Dashboard = {
  totals: { accounts: number; new_this_week: number; imported: number; came_back: number; pro: number }
  steps: { step: string; accounts: number }[]
  sign_ups_by_day: { day: string; accounts: number }[]
  accounts: {
    email: string
    signed_up_at: string
    signed_up_with: string
    confirmed: boolean
    projects: number
    repositories: number
    whiteboards: number
    pages: number
    came_back: boolean
    plan: string
    last_active_at: string | null
    steps: string[]
  }[]
  errors_this_week: {
    source: string
    route: string | null
    name: string
    message: string
    count: number
    first_seen: string
  }[]
}

const STEP_NAMES: Record<string, string> = {
  signed_up: "Signed up",
  opened_github_import: "Opened the GitHub import",
  imported_repository: "Imported a repository",
  imported_files: "Imported files",
  created_project: "Created a project",
  created_whiteboard: "Created a whiteboard",
  made_edit: "Made an edit",
  invited_someone: "Invited someone",
  connected_agent: "Connected an agent",
  connected_github: "Connected GitHub",
  opened_billing: "Opened billing",
  upgraded: "Upgraded",
  came_back: "Came back",
}
const REFUSED = "import_refused_"
const stepName = (step: string) => {
  if (STEP_NAMES[step]) return STEP_NAMES[step]
  // A refused import's reason: "not_found" reads "Not found".
  const words = (step.startsWith(REFUSED) ? step.slice(REFUSED.length) : step).replace(/_/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// One hue for every bar: these charts have a single series each.
const BAR = COLORS.blue.stroke

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data } = await supabase.rpc("operator_dashboard")
  if (!data) notFound()
  const dashboard = data as unknown as Dashboard

  const journey = dashboard.steps.filter((s) => !s.step.startsWith(REFUSED))
  const refused = dashboard.steps.filter((s) => s.step.startsWith(REFUSED) && s.accounts > 0)

  return (
    <div className="min-h-svh bg-paper text-ink">
      <header className="flex items-center gap-3 border-b border-rule bg-sheet px-6 py-3">
        <Wordmark className="text-base text-ink" />
        <span className="text-sm text-graphite">Dashboard</span>
        <p className="ml-auto text-xs text-graphite max-md:hidden">
          From the step record and error reports. Your own account is left out.
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
        <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="Accounts" value={dashboard.totals.accounts} />
          <Tile label="New this week" value={dashboard.totals.new_this_week} />
          <Tile label="Imported a repository" value={dashboard.totals.imported} />
          <Tile label="Came back" value={dashboard.totals.came_back} />
          <Tile label="On Pro" value={dashboard.totals.pro} />
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card title="Sign-ups, last 30 days" note="By day, in UTC.">
            <SignUps days={dashboard.sign_ups_by_day} />
          </Card>
          <Card title="How far accounts got" note="Accounts that reached each step, at any time.">
            <Funnel steps={journey} total={dashboard.totals.accounts} />
            {refused.length > 0 && (
              <div className="mt-4 border-t border-rule pt-3">
                <p className="mb-2 text-xs text-graphite">Refused imports, by reason</p>
                <Funnel steps={refused} total={dashboard.totals.accounts} />
              </div>
            )}
          </Card>
        </div>

        <Card
          title="Accounts"
          note={`${dashboard.accounts.length} ${dashboard.accounts.length === 1 ? "account" : "accounts"}, newest first${dashboard.accounts.length === 50 ? " (the 50 newest)" : ""}.`}
        >
          <Accounts accounts={dashboard.accounts} />
        </Card>

        <Card title="Errors this week" note="The ten that happened most, from the app's own error reports.">
          <Errors errors={dashboard.errors_this_week} />
        </Card>
      </main>
    </div>
  )
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-rule bg-sheet p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="mt-0.5 mb-4 text-xs text-graphite">{note}</p>}
      {children}
    </section>
  )
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-rule bg-sheet p-4">
      <p className="text-xs text-graphite">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value.toLocaleString("en-US")}</p>
    </div>
  )
}

// A column per day, from one baseline, labelled at the busiest day; every
// column says its day and count on hover.
function SignUps({ days }: { days: Dashboard["sign_ups_by_day"] }) {
  const max = Math.max(1, ...days.map((d) => d.accounts))
  const busiest = days.reduce((best, d) => (d.accounts > best.accounts ? d : best), days[0])
  const short = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  return (
    <figure>
      <div className="flex h-36 items-end gap-[2px] border-b border-rule">
        {days.map((d) => (
          <div
            key={d.day}
            title={`${short(d.day)}: ${d.accounts} ${d.accounts === 1 ? "sign-up" : "sign-ups"}`}
            className="relative flex h-full min-w-0 flex-1 items-end justify-center"
          >
            {d === busiest && d.accounts > 0 && (
              <span
                className="absolute text-[11px] text-graphite tabular-nums"
                style={{ bottom: `calc(${(d.accounts / max) * 100}% + 2px)` }}
              >
                {d.accounts}
              </span>
            )}
            <div
              className="w-full max-w-6 rounded-t-[4px]"
              style={{ height: `${(d.accounts / max) * 100}%`, background: BAR }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 flex justify-between text-[11px] text-graphite tabular-nums">
        <span>{short(days[0].day)}</span>
        <span>{short(days[days.length - 1].day)}</span>
      </figcaption>
    </figure>
  )
}

// A bar per step, its length the share of all accounts, the count at its tip.
function Funnel({ steps, total }: { steps: Dashboard["steps"]; total: number }) {
  return (
    <ul className="flex flex-col gap-2">
      {steps.map((s) => (
        <li key={s.step} className="grid grid-cols-[11rem_1fr] items-center gap-3 text-sm">
          <span className="truncate text-graphite">{stepName(s.step)}</span>
          <span className="flex items-center gap-2">
            {s.accounts > 0 && (
              <span
                className="h-3 max-w-[calc(100%-2.5rem)] rounded-r-[4px]"
                style={{ width: `${(s.accounts / Math.max(1, total)) * 100}%`, background: BAR }}
              />
            )}
            <span className="text-xs tabular-nums">{s.accounts}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function Accounts({ accounts }: { accounts: Dashboard["accounts"] }) {
  if (!accounts.length) return <p className="text-sm text-graphite">No accounts yet.</p>
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="text-xs text-graphite">
          <tr className="border-b border-rule">
            <th className="px-5 py-2 font-normal">Signed up</th>
            <th className="px-2 py-2 font-normal">Email</th>
            <th className="px-2 py-2 font-normal">With</th>
            <th className="px-2 py-2 text-right font-normal">Projects</th>
            <th className="px-2 py-2 text-right font-normal">Imports</th>
            <th className="px-2 py-2 text-right font-normal">Boards</th>
            <th className="px-2 py-2 text-right font-normal">Pages</th>
            <th className="px-2 py-2 font-normal">Steps</th>
            <th className="px-5 py-2 font-normal">Last active</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={`${a.email}-${a.signed_up_at}`} className="border-b border-rule last:border-0 align-top">
              <td className="px-5 py-2 whitespace-nowrap tabular-nums">
                <LocalTime iso={a.signed_up_at} />
              </td>
              <td className="max-w-64 truncate px-2 py-2" title={a.email}>
                {a.email}
                {!a.confirmed && <span className="ml-1 text-xs text-graphite">(unconfirmed)</span>}
                {a.plan === "Pro" && <span className="ml-1 text-xs text-graphite">Pro</span>}
              </td>
              <td className="px-2 py-2 text-graphite capitalize">{a.signed_up_with}</td>
              <td className="px-2 py-2 text-right tabular-nums">{a.projects}</td>
              <td className="px-2 py-2 text-right tabular-nums">{a.repositories}</td>
              <td className="px-2 py-2 text-right tabular-nums">{a.whiteboards}</td>
              <td className="px-2 py-2 text-right tabular-nums">{a.pages}</td>
              <td className="px-2 py-2 text-xs text-graphite">
                {a.steps.filter((s) => s !== "signed_up").map(stepName).join(", ") || "Nothing yet"}
              </td>
              <td className="px-5 py-2 whitespace-nowrap tabular-nums">
                {a.last_active_at ? <LocalTime iso={a.last_active_at} /> : "Never"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Errors({ errors }: { errors: Dashboard["errors_this_week"] }) {
  if (!errors.length) return <p className="text-sm text-graphite">Nothing went wrong this week.</p>
  return (
    <ul className="flex flex-col divide-y divide-rule">
      {errors.map((e) => (
        <li key={`${e.source}-${e.route}-${e.name}-${e.first_seen}`} className="flex gap-4 py-2 text-sm">
          <span className="w-10 shrink-0 text-right tabular-nums">{e.count}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{e.name}</span>: {e.message}
            <span className="block text-xs text-graphite">
              {e.source}
              {e.route ? ` · ${e.route}` : ""} · first seen <LocalTime iso={e.first_seen} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
