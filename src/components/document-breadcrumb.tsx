import Link from "next/link"

import { documentHref, type ProjectPath } from "@/lib/navigation"
import { cn } from "@/lib/utils"

export type Crumb = { id: string; title: string }

// The way back out (R2.1). Each sheet you came through is a tab, tucked
// behind the next, so the trail looks like what it is: a stack you are on
// top of. Each tab links back along the same trail.
export function DocumentBreadcrumb({
  project,
  projectName,
  trail,
}: {
  project: ProjectPath
  projectName: string
  trail: Crumb[]
  // Kept for callers; the open document's own title sits right below.
  current?: string
}) {
  const tabs = [
    { key: "project", title: projectName, href: `/${project.slug}/${project.projectId}` },
    ...trail.map((crumb, index) => ({
      key: `${crumb.id}-${index}`,
      title: crumb.title,
      href: documentHref(
        project,
        crumb.id,
        trail.slice(0, index).map((c) => c.id)
      ),
    })),
  ]

  return (
    <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-2">
      <ol className="flex min-w-0 items-center">
        {tabs.map((tab, index) => (
          <li key={tab.key} className={cn("min-w-0", index > 0 && "-ml-1.5")} style={{ zIndex: index }}>
            <Link
              href={tab.href}
              className="block max-w-40 truncate rounded-md border border-rule bg-sheet px-2 py-1 text-xs text-graphite shadow-[2px_0_0_0_var(--paper)] transition-colors outline-none hover:border-cobalt hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tab.title}
            </Link>
          </li>
        ))}
      </ol>
      {trail.length > 0 && (
        <span className="shrink-0 font-mono text-[10px] tracking-wide text-graphite uppercase">
          {trail.length} deep
        </span>
      )}
    </nav>
  )
}
