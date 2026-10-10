import type { Metadata } from "next"
import { Globe } from "lucide-react"
import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { Wordmark } from "@/components/logo"
import { ProjectAddresses, type AddressEntry } from "@/components/project-addresses"
import { ReportAbuse } from "@/components/report-abuse"
import { MobileTree } from "@/components/tree/mobile-tree"
import { ProjectTree } from "@/components/tree/project-tree"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Sidebar, SidebarContent, SidebarProvider } from "@/components/ui/sidebar"
import { billingConfigured } from "@/lib/billing/stripe"
import { projectHref } from "@/lib/navigation"
import { getProjectAccess } from "@/lib/project-access"
import { hasRole } from "@/lib/roles"
import { buildTree } from "@/lib/tree"

// A public project's pages are reachable by link only (R6.6). Members' pages
// need a sign-in, so saying it for every project costs nothing.
export const metadata: Metadata = { robots: { index: false, follow: false } }

// One address for everyone (lib/navigation.ts): a member gets the app, and
// anyone else the read-only view of a public project.
export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/[org]/[project]">) {
  const { org: slug, project: projectParam } = await params
  const access = await getProjectAccess(slug, projectParam)
  const { supabase, project, path } = access

  const [{ data: folders }, { data: documents }] = await Promise.all([
    supabase
      .from("folders")
      .select("id, name, parent_folder_id, position")
      .eq("project_id", project.id)
      .is("deleted_at", null),
    // Every document, the pages of boxes and arrows included, for their
    // addresses; the list shows the standard ones.
    supabase
      .from("documents")
      .select("id, code, title, type, kind, folder_id, parent_document_id, position")
      .eq("project_id", project.id)
      .is("deleted_at", null),
  ])
  const addresses: AddressEntry[] = (documents ?? []).map((row) => [row.id, row.code, row.title])
  const nodes = buildTree(
    folders ?? [],
    (documents ?? []).filter((row) => row.kind === "standard")
  )

  if (access.kind === "visitor") {
    const tree = (
      <ProjectTree
        project={{ ...path, orgId: project.org_id, projectId: project.id }}
        projectName={project.name}
        nodes={nodes}
        canEdit={false}
      />
    )
    return (
      <ProjectAddresses project={path} documents={addresses}>
        <header className="flex h-12 items-center gap-3 border-b bg-sheet px-4">
          <Link href="/" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Wordmark />
          </Link>
          <Badge variant="secondary">
            <Globe />
            Public project
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            <ReportAbuse projectId={project.id} />
            {!access.user && (
              <Link
                href={`/login?next=${encodeURIComponent(projectHref(path))}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Sign in
              </Link>
            )}
          </div>
        </header>
        <SidebarProvider className="min-h-0 flex-1 flex-col md:flex-row">
          <MobileTree title={project.name}>
            <SidebarContent>{tree}</SidebarContent>
          </MobileTree>
          <Sidebar collapsible="none" className="sticky top-0 hidden h-[calc(100svh-3rem)] border-r border-rule md:flex">
            <SidebarContent>{tree}</SidebarContent>
          </Sidebar>
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </SidebarProvider>
      </ProjectAddresses>
    )
  }

  const { org, plan, canEdit, role } = access
  const sidebarProject = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    visibility: project.visibility,
    takenDown: project.taken_down_at !== null,
  }
  const showUsage =
    project.visibility === "private" &&
    plan &&
    !plan.paid &&
    plan.private_document_limit != null &&
    billingConfigured()

  const tree = (
    <ProjectTree
      project={{ ...path, orgId: org.id, projectId: project.id }}
      projectName={project.name}
      row={{ href: projectHref(path), ...sidebarProject }}
      nodes={nodes}
      canEdit={canEdit}
      canDelete={hasRole(role, "admin")}
      trashHref={`${projectHref(path)}/trash`}
    />
  )
  const footer = showUsage && (
    <Link
      href={`/${org.slug}/settings/billing`}
      className="flex flex-col gap-1.5 rounded-md px-2 py-1.5 text-xs text-graphite outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex justify-between">
        <span>Private documents</span>
        <span className="font-mono">
          {plan.private_documents}/{plan.private_document_limit}
        </span>
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-rule" aria-hidden>
        <span
          className="block h-full rounded-full bg-cobalt"
          style={{
            width: `${Math.min(100, (plan.private_documents / Math.max(1, plan.private_document_limit)) * 100)}%`,
          }}
        />
      </span>
    </Link>
  )

  return (
    <ProjectAddresses project={path} documents={addresses}>
      <AppShell slug={slug} title={project.name} project={sidebarProject} tree={tree} footer={footer}>
        {children}
      </AppShell>
    </ProjectAddresses>
  )
}
