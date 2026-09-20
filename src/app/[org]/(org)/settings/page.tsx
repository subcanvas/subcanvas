import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { billingConfigured } from "@/lib/billing/stripe"
import { getOrgContext } from "@/lib/orgs"

import { OpenFirstSection } from "./open-first-section"
import { settingsGroups } from "./sections"

export const metadata = { title: "Settings" }

// The section list as a page, for a narrow screen. A wide screen already has
// the list beside every section, so there it goes straight to the first one.
export default async function SettingsPage({ params }: PageProps<"/[org]/settings">) {
  const { org: slug } = await params
  const { org } = await getOrgContext(slug)
  const groups = settingsGroups(org, billingConfigured())

  return (
    <main id="main" className="flex flex-col gap-8 md:hidden">
      <OpenFirstSection href={groups[0].sections[0].href} />
      <PageHeader title="Settings" />
      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-2">
          <h2 className="truncate font-mono text-xs tracking-wide text-graphite uppercase">{group.label}</h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-sheet">
            {group.sections.map(({ href, label, detail, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                >
                  <Icon className="size-4 shrink-0 text-graphite" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-sm text-graphite">{detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-graphite" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
