"use client"

import Link from "next/link"

import { cn } from "@/lib/utils"
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
import { ItemIconMark } from "@/components/item-icon"
import { useProjectAddresses } from "@/components/project-addresses"
import type { ItemIcon } from "@/lib/item-icon"
import { projectHref } from "@/lib/navigation"

export type Crumb = { id: string; title: string; icon: ItemIcon | null }

// A crumb's name, with its icon in front when it has one. The link or page
// around it is a flex box with a maximum width, so a long name is cut short
// with "…" here instead of running into the next crumb.
function Named({ icon, title }: { icon: ItemIcon | null; title: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <ItemIconMark icon={icon} className="size-3.5 text-[13px]" />
      <span className="truncate">{title}</span>
    </span>
  )
}

// A deep trail keeps the project and the last two sheets in view; the ones
// between fold into a menu.
const VISIBLE = 4

// The way back out (R2.1): the project, then each sheet you came through.
// Each one links back along the same trail, and the trail ends with the open
// document's own name.
export function DocumentBreadcrumb({
  projectName,
  projectIcon,
  trail,
  current,
  currentIcon,
}: {
  projectName: string
  projectIcon: ItemIcon | null
  trail: Crumb[]
  current: string
  currentIcon: ItemIcon | null
}) {
  const addresses = useProjectAddresses()
  const crumbs = [
    { key: "project", title: projectName, icon: projectIcon, href: projectHref(addresses.project) },
    ...trail.map((crumb, index) => ({
      key: `${crumb.id}-${index}`,
      title: crumb.title,
      icon: crumb.icon,
      href: addresses.href(
        crumb.id,
        trail.slice(0, index).map((c) => c.id)
      ),
    })),
  ]
  const folded = crumbs.length > VISIBLE ? crumbs.slice(1, -2) : []
  const shown = folded.length ? [crumbs[0], ...crumbs.slice(-2)] : crumbs

  // On a narrow canvas (the object panel open beside it, say) there is no
  // room for the whole trail before the tools, and squeezing every crumb to
  // a letter reads as nothing. There, only the sheet one level up stays,
  // which is the one a person is most likely to want back.
  const narrow = "@max-[56rem]:hidden"

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1 text-xs">
        {shown.map((crumb, index) => (
          <Fragment key={crumb.key}>
            {index > 0 && <BreadcrumbSeparator className={index < shown.length - 1 ? narrow : undefined} />}
            {index === 1 && folded.length > 0 && (
              <>
                <BreadcrumbItem className={narrow}>
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
                          <Named icon={item.icon} title={item.title} />
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </BreadcrumbItem>
                <BreadcrumbSeparator className={narrow} />
              </>
            )}
            <BreadcrumbItem className={cn("min-w-0", index < shown.length - 1 && narrow)}>
              <BreadcrumbLink
                render={<Link href={crumb.href} />}
                className="flex max-w-40 min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Named icon={crumb.icon} title={crumb.title} />
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}
        <BreadcrumbSeparator />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="flex max-w-40 min-w-0">
            <Named icon={currentIcon} title={current || "Untitled"} />
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
