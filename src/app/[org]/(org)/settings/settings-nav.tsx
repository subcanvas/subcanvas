"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { settingsGroups } from "./sections"

// The section list beside every settings page on a wide screen.
export function SettingsNav({
  org,
  showBilling,
}: {
  org: { name: string; slug: string }
  showBilling: boolean
}) {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings" className="sticky top-10 hidden w-44 shrink-0 flex-col gap-6 self-start md:flex">
      {settingsGroups(org, showBilling).map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="truncate px-2 pb-1 font-mono text-xs tracking-wide text-graphite uppercase">{group.label}</p>
          {group.sections.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-graphite outline-none transition-colors hover:bg-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-ink"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

// On a narrow screen the list is a page of its own, and every section leads
// back to it.
export function BackToSettings({ slug }: { slug: string }) {
  const pathname = usePathname()
  const index = `/${slug}/settings`
  if (pathname === index) return null

  return (
    <Link
      href={index}
      className="-ml-1 flex items-center gap-1 self-start rounded-md text-sm text-graphite outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring md:hidden"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Settings
    </Link>
  )
}
