"use client"

import { PanelLeftOpen } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { AccountMenu, isCurrentPage, orgPages, UserAvatar, type SidebarUser } from "@/components/account-menu"
import { Button, buttonVariants } from "@/components/ui/button"
import { Sidebar, useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// The sidebar on a wide screen. Collapsed, it is a rail that still earns its
// width: the org's pages as icons and the account menu, under the button
// that brings the rest back. A project's documents need the open sidebar.
export function DesktopSidebar({
  slug,
  user,
  children,
}: {
  slug: string
  user: SidebarUser
  children: React.ReactNode
}) {
  const { open, toggleSidebar } = useSidebar()
  const pathname = usePathname()

  if (!open)
    return (
      <div className="sticky top-0 hidden h-svh w-12 shrink-0 flex-col items-center gap-1 border-r border-rule bg-sidebar py-2 md:flex">
        <Button variant="ghost" size="icon" aria-label="Show the sidebar" title="Show the sidebar (⌘\)" onClick={toggleSidebar}>
          <PanelLeftOpen />
        </Button>
        <nav aria-label="Org" className="mt-1 flex flex-col items-center gap-1 border-t border-rule pt-2">
          {orgPages(slug).map((page) => (
            <Link
              key={page.href}
              href={page.href}
              aria-label={page.label}
              title={page.label}
              aria-current={isCurrentPage(pathname, page) ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "text-graphite aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-ink"
              )}
            >
              <page.icon />
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <AccountMenu
            slug={slug}
            user={user}
            side="right"
            trigger={
              <Button variant="ghost" size="icon" aria-label="Account menu" title={user.name ?? user.email}>
                <UserAvatar user={user} className="size-6" />
              </Button>
            }
          />
        </div>
      </div>
    )

  return (
    <Sidebar collapsible="none" className="sticky top-0 hidden h-svh border-r border-rule md:flex">
      {children}
    </Sidebar>
  )
}
