import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { DesktopSidebar } from "@/components/desktop-sidebar"
import { MobileTree } from "@/components/tree/mobile-tree"
import { SidebarSectionsProvider, type SidebarProject, type SidebarWorkspace } from "@/components/workspace-sections"
import { SidebarProvider } from "@/components/ui/sidebar"
import { agentSignInAvailable } from "@/lib/mcp/sign-in"
import { privateDocumentLimit } from "@/lib/org-access"
import { getOrgContext } from "@/lib/orgs"
import { hasRole, type Role } from "@/lib/roles"
import {
  readClosedSections,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_SECTION_PROJECT_LIMIT,
  SIDEBAR_SECTIONS_COOKIE_NAME,
} from "@/lib/sidebar-state"

// The frame around every signed-in page: the sidebar on a wide screen, the
// same sidebar in a drawer on a narrow one, and the page beside it. Inside a
// project, the layout passes the project, its documents as `tree`, and its
// own footer rows as `footer`.
export async function AppShell({
  slug,
  title,
  project,
  tree,
  footer,
  children,
}: {
  slug: string
  // Shown beside the drawer's button on a narrow screen.
  title?: string
  project?: SidebarProject
  tree?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const { supabase, user, org, plan, canEdit } = await getOrgContext(slug)
  const [{ data: orgs }, { data: profile }, agents, cookieStore] = await Promise.all([
    // Every workspace the person is in, with their role and its first
    // projects by name, in one query. Row-level security decides what is
    // there; the limit is per workspace, one more than is shown, so the
    // sidebar knows when to offer "Show all".
    supabase
      .from("orgs")
      .select("id, name, slug, personal_owner, org_members(role), projects(id, slug, name, visibility, taken_down_at)")
      .eq("org_members.user_id", user.id)
      .order("name", { referencedTable: "projects" })
      .limit(SIDEBAR_SECTION_PROJECT_LIMIT + 1, { referencedTable: "projects" }),
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single(),
    agentSignInAvailable(),
    cookies(),
  ])

  const workspaces: SidebarWorkspace[] = (orgs ?? [])
    .map((row) => {
      const current = row.slug === org.slug
      const role = (row.org_members[0]?.role ?? "viewer") as Role
      const projects: SidebarProject[] = row.projects
        .slice(0, SIDEBAR_SECTION_PROJECT_LIMIT)
        .map(({ id, slug, name, visibility, taken_down_at }) => ({
          id,
          slug,
          name,
          visibility,
          takenDown: taken_down_at !== null,
        }))
      // The open project is listed even when it is past the limit.
      if (current && project && !projects.some(({ id }) => id === project.id)) projects.push(project)
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        personal: row.personal_owner !== null,
        // The workspace being looked at knows its plan, and whether it is
        // locked. For the others, the role decides, and creating the project
        // still checks everything.
        canCreate: current ? canEdit : hasRole(role, "editor"),
        canPublish: hasRole(role, "admin"),
        privateLimit: current ? privateDocumentLimit(plan) : null,
        projects,
        more: row.projects.length > SIDEBAR_SECTION_PROJECT_LIMIT,
      }
    })
    // Personal first, then the team workspaces by name.
    .sort((a, b) => Number(b.personal) - Number(a.personal) || a.name.localeCompare(b.name))

  const sidebarUser = {
    email: user.email ?? "",
    name: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  }
  const contents = (
    <AppSidebar
      org={org}
      workspaces={workspaces}
      projectId={project?.id}
      user={sidebarUser}
      agents={agents}
      footer={footer}
    >
      {tree}
    </AppSidebar>
  )

  // Collapsing the sidebar, and its sections, is remembered, and read here so
  // the page does not render open and then snap shut. The section of the
  // workspace being looked at is open whatever was remembered.
  const open = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== "false"
  const closed = readClosedSections(cookieStore.get(SIDEBAR_SECTIONS_COOKIE_NAME)?.value).filter(
    (closedSlug) => closedSlug !== org.slug
  )

  return (
    <SidebarProvider defaultOpen={open} className="min-h-0 flex-1 flex-col md:flex-row">
      <SidebarSectionsProvider closed={closed} current={org.slug}>
        <MobileTree label="Menu" title={title ?? org.name} description="Where to go, and your account.">
          {contents}
        </MobileTree>
        <DesktopSidebar slug={org.slug} user={sidebarUser} agents={agents}>
          {contents}
        </DesktopSidebar>
      </SidebarSectionsProvider>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </SidebarProvider>
  )
}
