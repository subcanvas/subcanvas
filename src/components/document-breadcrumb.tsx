"use client"

import Link from "next/link"
import { Fragment } from "react"

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { documentHref, type ProjectPath } from "@/lib/navigation"

export type Crumb = { id: string; title: string }

// A deep trail keeps the project and the last two sheets in view; the ones
// between fold into a menu.
const VISIBLE = 4

// The way back out (R2.1): the project, then each sheet you came through.
// Each one links back along the same trail, and the trail ends with the open
// document's own name.
export function DocumentBreadcrumb({
  project,
  projectName,
  trail,
  current,
}: {
  project: ProjectPath
  projectName: string
  trail: Crumb[]
  current: string
}) {
  const crumbs = [
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
  const folded = crumbs.length > VISIBLE ? crumbs.slice(1, -2) : []
  const shown = folded.length ? [crumbs[0], ...crumbs.slice(-2)] : crumbs

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1 text-xs">
        {shown.map((crumb, index) => (
          <Fragment key={crumb.key}>
            {index > 0 && <BreadcrumbSeparator />}
            {index === 1 && folded.length > 0 && (
              <>
                <BreadcrumbItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`${folded.length} more`}
                      className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <BreadcrumbEllipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {folded.map((item) => (
                        <DropdownMenuItem key={item.key} render={<Link href={item.href} />}>
                          {item.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbLink
                render={<Link href={crumb.href} />}
                className="max-w-40 truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {crumb.title}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}
        <BreadcrumbSeparator />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="max-w-40 truncate">{current || "Untitled"}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
