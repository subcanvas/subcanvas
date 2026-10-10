"use client"

import { Bot, ChevronRight, EyeOff, Globe, LayoutGrid, MoreHorizontal, Plus, Settings, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createContext, Fragment, useCallback, useContext, useEffect, useId, useMemo, useState } from "react"

import { NewProject } from "@/app/[org]/(org)/new-project-form"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import {
  SIDEBAR_SECTIONS_COOKIE_MAX_AGE,
  SIDEBAR_SECTIONS_COOKIE_NAME,
  writeClosedSections,
} from "@/lib/sidebar-state"
import { cn } from "@/lib/utils"

// Every workspace the person is in, as a section of the sidebar: Personal
// first, then the team workspaces by name. A section lists its projects, and
// the project being viewed opens in place to show its tree.

export type SidebarProject = {
  id: string
  // Its short name, the last part of its address.
  slug: string
  name: string
  visibility: "private" | "public"
  takenDown: boolean
}

export type SidebarWorkspace = {
  id: string
  name: string
  slug: string
  personal: boolean
  // May make a project here: an editor or above, and not locked.
  canCreate: boolean
  // May make one public: an admin or above.
  canPublish: boolean
  privateLimit: number | null
  projects: SidebarProject[]
  // More projects than the section lists.
  more: boolean
}

// What a section's heading says. A personal workspace is named after its
// person ("Ada's workspace") unless renamed; "Personal" says what it is in
// fewer letters, as Notion's "Private" does.
export const sectionLabel = (workspace: { name: string; personal: boolean }) =>
  workspace.personal ? "Personal" : workspace.name

// Which sections are open, shared by the sidebar and its copy in the drawer
// on a narrow screen, and remembered in a cookie.
const SectionsContext = createContext<{ isOpen: (slug: string) => boolean; toggle: (slug: string) => void } | null>(
  null
)

export function SidebarSectionsProvider({
  closed: initial,
  current,
  children,
}: {
  // Closed when the page was rendered, the current workspace already left out.
  closed: string[]
  // The workspace the page is in.
  current: string
  children: React.ReactNode
}) {
  const [closed, setClosed] = useState(() => new Set(initial))
  // Arriving in a workspace opens its section. It can be closed again while
  // there; it re-opens only on arriving again.
  const [arrivedIn, setArrivedIn] = useState(current)
  if (arrivedIn !== current) {
    setArrivedIn(current)
    if (closed.has(current)) {
      const next = new Set(closed)
      next.delete(current)
      setClosed(next)
    }
  }

  useEffect(() => {
    document.cookie = `${SIDEBAR_SECTIONS_COOKIE_NAME}=${writeClosedSections(closed)}; path=/; max-age=${SIDEBAR_SECTIONS_COOKIE_MAX_AGE}; samesite=lax`
  }, [closed])

  const toggle = useCallback((slug: string) => {
    setClosed((current) => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])
  const value = useMemo(() => ({ isOpen: (slug: string) => !closed.has(slug), toggle }), [closed, toggle])

  return <SectionsContext.Provider value={value}>{children}</SectionsContext.Provider>
}

function useSections() {
  const context = useContext(SectionsContext)
  if (!context) throw new Error("useSections must be used within a SidebarSectionsProvider.")
  return context
}

// `tree` is the open project's tree, which takes that project's row.
export function WorkspaceSections({
  workspaces,
  currentSlug,
  currentProjectId,
  agents,
  tree,
}: {
  workspaces: SidebarWorkspace[]
  currentSlug: string
  currentProjectId?: string
  agents: boolean
  tree?: React.ReactNode
}) {
  return (
    <>
      {workspaces.map((workspace) => (
        <WorkspaceSection
          key={workspace.slug}
          workspace={workspace}
          agents={agents}
          openProjectId={workspace.slug === currentSlug ? currentProjectId : undefined}
          tree={workspace.slug === currentSlug ? tree : undefined}
        />
      ))}
      <SidebarGroup className="pt-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={`/onboarding?from=${encodeURIComponent(currentSlug)}`} />}
              className="text-graphite"
            >
              <Plus />
              <span>New team workspace</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}

// The small buttons beside a section's heading.
const headingAction =
  "flex size-6 items-center justify-center rounded-md text-graphite outline-none hover:bg-sidebar-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-accent aria-expanded:text-ink [&>svg]:size-4"

function WorkspaceSection({
  workspace,
  agents,
  openProjectId,
  tree,
}: {
  workspace: SidebarWorkspace
  agents: boolean
  openProjectId?: string
  tree?: React.ReactNode
}) {
  const { isOpen, toggle } = useSections()
  const open = isOpen(workspace.slug)
  const listId = useId()
  const label = sectionLabel(workspace)
  const base = `/${workspace.slug}`

  return (
    <SidebarGroup className="py-1">
      <div className="group/section relative flex items-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => toggle(workspace.slug)}
          className={cn(
            "flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md px-2 text-left text-xs font-medium text-graphite outline-none hover:bg-sidebar-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            workspace.canCreate ? "pr-15" : "pr-8"
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronRight
            aria-hidden
            className={cn("size-3 shrink-0 opacity-70 transition-transform", open && "rotate-90")}
          />
        </button>
        {/* Shown on a hover or focus where there is a pointer; always on a touch screen. */}
        <div className="absolute right-0.5 flex items-center gap-0.5 transition-opacity group-focus-within/section:opacity-100 group-hover/section:opacity-100 has-aria-expanded:opacity-100 md:opacity-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button type="button" aria-label={`${label} workspace menu`} title="Workspace pages" className={headingAction}>
                  <MoreHorizontal />
                </button>
              }
            />
            <DropdownMenuContent align="start" className="max-w-72 min-w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate">{workspace.name}</DropdownMenuLabel>
                <DropdownMenuItem render={<Link href={base} />}>
                  <LayoutGrid />
                  Projects
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={`${base}/settings/general`} />}>
                  <Settings />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={`${base}/settings/members`} />}>
                  <Users />
                  Members
                </DropdownMenuItem>
                {/* Only where agents can sign in to this server (lib/mcp/sign-in). */}
                {agents && (
                  <DropdownMenuItem render={<Link href={`${base}/agents`} />}>
                    <Bot />
                    Connect an agent
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {workspace.canCreate && (
            <NewProject
              slug={workspace.slug}
              orgId={workspace.id}
              canPublish={workspace.canPublish}
              privateLimit={workspace.privateLimit}
              trigger={
                <button type="button" aria-label={`New project in ${label}`} title="New project" className={headingAction}>
                  <Plus />
                </button>
              }
            />
          )}
        </div>
      </div>

      {/* Hidden, not removed, so the open project's tree keeps what is expanded. */}
      <SidebarMenu id={listId} hidden={!open} className="pt-0.5">
        {workspace.projects.map((project) =>
          project.id === openProjectId && tree ? (
            <Fragment key={project.id}>{tree}</Fragment>
          ) : (
            <SidebarMenuItem key={project.id}>
              <ProjectLink href={`${base}/${project.slug}`} project={project} />
            </SidebarMenuItem>
          )
        )}
        {workspace.more && (
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={base} aria-label={`Show all projects in ${label}`} />}
              className="text-graphite"
            >
              <MoreHorizontal />
              <span>Show all</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        {workspace.projects.length === 0 && (
          <li className="px-2 py-1 text-xs text-graphite">No projects yet</li>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}

// A project, drawn as a stack of sheets.
function SheetsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path d="M5.5 2.25h6.25a2 2 0 0 1 2 2v6.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="2.25" y="4.75" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

// A project's row: its name, and a quiet mark when it is public or taken
// down. Private is the usual case and goes unmarked. The project's tree
// uses it too, for the open project.
export function ProjectLink({
  href,
  project,
  className,
}: {
  href: string
  project: Pick<SidebarProject, "name" | "visibility" | "takenDown">
  className?: string
}) {
  const pathname = usePathname()
  const current = pathname === href
  const Marker = project.takenDown ? EyeOff : project.visibility === "public" ? Globe : null
  return (
    <SidebarMenuButton
      isActive={current}
      render={<Link href={href} aria-current={current ? "page" : undefined} draggable={false} />}
      className={cn("data-active:shadow-[inset_2px_0_0_0_var(--cobalt)]", className)}
    >
      <SheetsIcon className="text-graphite" />
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {Marker && (
        <span title={project.takenDown ? "Taken down" : "Public"} className="flex shrink-0 text-graphite">
          <Marker className="size-3!" aria-hidden />
        </span>
      )}
    </SidebarMenuButton>
  )
}
