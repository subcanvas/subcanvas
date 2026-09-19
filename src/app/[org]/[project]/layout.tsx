import { Trash2 } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ProjectTree } from "@/components/tree/project-tree"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { getOrgContext } from "@/lib/orgs"
import { hasRole } from "@/lib/roles"
import { buildTree } from "@/lib/tree"

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/[org]/[project]">) {
  const { org: slug, project: projectId } = await params
  const { supabase, org, role } = await getOrgContext(slug)

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .eq("org_id", org.id)
    .maybeSingle()
  if (!project) notFound()

  const [{ data: folders }, { data: documents }, { data: usageRows }] = await Promise.all([
    supabase
      .from("folders")
      .select("id, name, parent_folder_id, position")
      .eq("project_id", project.id),
    supabase
      .from("documents")
      .select("id, title, type, folder_id, parent_document_id, position")
      .eq("project_id", project.id)
      .eq("kind", "standard")
      .is("deleted_at", null),
    supabase.rpc("org_usage", { p_org_id: org.id }),
  ])
  const usage = usageRows?.[0]

  return (
    <SidebarProvider className="min-h-0 flex-1">
      <Sidebar collapsible="none" className="sticky top-0 h-[calc(100svh-3rem)] border-r">
        <SidebarContent>
          <ProjectTree
            project={{ slug: org.slug, orgId: org.id, projectId: project.id }}
            projectName={project.name}
            nodes={buildTree(folders ?? [], documents ?? [])}
            canEdit={hasRole(role, "editor")}
          />
        </SidebarContent>
        <SidebarFooter>
          {usage && !usage.paid && usage.document_limit != null && (
            <Link
              href={`/${org.slug}/settings/billing`}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent"
            >
              {usage.documents} of {usage.document_limit} free documents used
            </Link>
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href={`/${org.slug}/${project.id}/trash`} />}>
                <Trash2 />
                Trash
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </SidebarProvider>
  )
}
