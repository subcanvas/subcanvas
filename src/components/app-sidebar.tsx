"use client"

import { ChevronsUpDown, PanelLeftClose, Plus } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { AccountMenu, orgPages, UserAvatar, type SidebarUser } from "@/components/account-menu"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

type Org = { name: string; slug: string }

// What is in the sidebar on every page of an org: which org this is at the
// top, the org's pages, and your account at the bottom. Inside a project, the
// project's documents go in the middle.
export function AppSidebar({
  org,
  orgs,
  user,
  showBilling,
  children,
  footer,
}: {
  org: Org
  orgs: Org[]
  user: SidebarUser
  // False on a server with no paid plan to offer.
  showBilling: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()

  const pages = orgPages(org.slug, showBilling)

  return (
    <>
      <SidebarHeader className="flex-row items-center gap-1">
        <SidebarMenu className="min-w-0 flex-1">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton className="font-semibold">
                    <LogoMark />
                    <span className="truncate">{org.name}</span>
                    <ChevronsUpDown className="ml-auto text-graphite" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent align="start" className="min-w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Orgs</DropdownMenuLabel>
                  {orgs.map((o) => (
                    <DropdownMenuItem key={o.slug} render={<Link href={`/${o.slug}`} />}>
                      {o.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/onboarding" />}>
                  <Plus />
                  New org
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* The drawer on a narrow screen has its own close button. */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-graphite max-md:hidden"
          aria-label="Hide the sidebar"
          title="Hide the sidebar (⌘\)"
          onClick={toggleSidebar}
        >
          <PanelLeftClose />
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <nav aria-label="Org">
            <SidebarMenu>
              {pages.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton isActive={pathname === href} render={<Link href={href} />}>
                    <Icon className="text-graphite" />
                    {label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
        {children}
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-rule">
        {footer}
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu
              user={user}
              side="top"
              trigger={
                <SidebarMenuButton aria-label="Account menu">
                  <UserAvatar user={user} className="size-5" />
                  <span className="truncate">{user.name ?? user.email}</span>
                  <ChevronsUpDown className="ml-auto text-graphite" />
                </SidebarMenuButton>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  )
}
