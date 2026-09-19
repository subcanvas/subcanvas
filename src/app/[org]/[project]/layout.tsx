import { Trash2 } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { MobileTree } from "@/components/tree/mobile-tree"
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
import { billingConfigured } from "@/lib/billing/stripe"
import { getOrgContext } from "@/lib/orgs"
import { buildTree } from "@/lib/tree"

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/[org]/[project]">) {
  const { org: slug, project: projectId } = await params
  const { supabase, org, plan, canEdit } = await getOrgContext(slug)

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, visibility")
    .eq("id", projectId)
    .eq("org_id", org.id)
    .maybeSingle()
  if (!project) notFound()

  const [{ data: folders }, { data: documents }] = await Promise.all([
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
  ])

  const projectRef = { slug: org.slug, orgId: org.id, projectId: project.id }
  const showUsage =
    project.visibility === "private" &&
    plan &&
    !plan.paid &&
    plan.private_document_limit != null &&
    billingConfigured()

  // The same contents serve the sidebar on a wide screen and a drawer on a
  // narrow one.
  const contents = (
    <>
      <SidebarContent>
        <ProjectTree
          project={projectRef}
          projectName={project.name}
          nodes={buildTree(folders ?? [], documents ?? [])}
          canEdit={canEdit}
          canUpgrade={billingConfigured()}
        />
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t border-rule">
        {showUsage && (
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
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href={`/${org.slug}/${project.id}/trash`} />}>
              <Trash2 className="text-graphite" />
              Trash
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  )

  return (
    <SidebarProvider className="min-h-0 flex-1 flex-col md:flex-row">
      <MobileTree projectName={project.name}>{contents}</MobileTree>
      <Sidebar collapsible="none" className="sticky top-0 hidden h-[calc(100svh-3rem)] border-r border-rule md:flex">
        {contents}
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </SidebarProvider>
  )
}
