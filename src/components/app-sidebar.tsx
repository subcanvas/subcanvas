"use client"

import { ChevronsUpDown, PanelLeftClose } from "lucide-react"
import Link from "next/link"

import { AccountMenu, UserAvatar, type SidebarUser } from "@/components/account-menu"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { WorkspaceSections, type SidebarWorkspace } from "@/components/workspace-sections"
import { WORKSPACE_HOME } from "@/lib/home"

// What is in the sidebar on every signed-in page: every workspace the person
// is in, as a section listing its projects, and their account at the bottom.
// Inside a project, its tree (`children`) opens under it in its section.
export function AppSidebar({
  org,
  workspaces,
  projectId,
  user,
  agents,
  children,
  footer,
}: {
  // The workspace being looked at.
  org: { slug: string }
  // Personal first, then team workspaces.
  workspaces: SidebarWorkspace[]
  // The project being looked at, if any.
  projectId?: string
  user: SidebarUser
  agents: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  const { toggleSidebar } = useSidebar()

  return (
    <>
      <SidebarHeader className="flex-row items-center gap-1">
        <SidebarMenu className="min-w-0 flex-1">
          <SidebarMenuItem>
            {/* Home: the personal workspace. */}
            <SidebarMenuButton render={<Link href={WORKSPACE_HOME} />} className="w-auto font-semibold">
              <LogoMark />
              <span>Subcanvas</span>
            </SidebarMenuButton>
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
        <nav aria-label="Workspaces">
          <WorkspaceSections
            workspaces={workspaces}
            currentSlug={org.slug}
            currentProjectId={projectId}
            agents={agents}
            tree={children}
          />
        </nav>
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
