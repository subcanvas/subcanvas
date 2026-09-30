"use client"

import { Check, ChevronsUpDown, PanelLeftClose, Plus, UserRound, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { AccountMenu, isCurrentPage, orgPages, UserAvatar, type SidebarUser } from "@/components/account-menu"
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

type Workspace = { name: string; slug: string; personal: boolean }

// What is in the sidebar on every page of a workspace: which workspace this
// is at the top, its pages, and your account at the bottom. Inside a
// project, the project's documents go in the middle.
export function AppSidebar({
  org,
  workspaces,
  user,
  agents,
  children,
  footer,
}: {
  org: Workspace
  // Personal first, then team workspaces.
  workspaces: Workspace[]
  user: SidebarUser
  agents: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()

  const pages = orgPages(org.slug, agents)

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
              <DropdownMenuContent align="start" className="max-w-72 min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                  {workspaces.map((workspace) => {
                    const Icon = workspace.personal ? UserRound : Users
                    return (
                      <DropdownMenuItem key={workspace.slug} render={<Link href={`/${workspace.slug}`} />}>
                        <Icon className="text-graphite" />
                        <span className="truncate">{workspace.name}</span>
                        {workspace.slug === org.slug && <Check className="ml-auto" aria-hidden />}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href={`/onboarding?from=${encodeURIComponent(org.slug)}`} />}>
                  <Plus />
                  New team workspace
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
          <nav aria-label="Workspace">
            <SidebarMenu>
              {pages.map((page) => (
                <SidebarMenuItem key={page.href}>
                  <SidebarMenuButton isActive={isCurrentPage(pathname, page)} render={<Link href={page.href} />}>
                    <page.icon className="text-graphite" />
                    {page.label}
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
              slug={org.slug}
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
