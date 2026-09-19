import type { Metadata } from "next"
import { Globe } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ReportAbuse } from "@/components/report-abuse"
import { ProjectTree } from "@/components/tree/project-tree"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Sidebar, SidebarContent, SidebarProvider } from "@/components/ui/sidebar"
import { PUBLIC_SLUG } from "@/lib/public-route"
import { createClient } from "@/lib/supabase/server"
import { buildTree } from "@/lib/tree"

// Public pages are reachable by link only (R6.6).
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function PublicProjectLayout({
  children,
  params,
}: LayoutProps<"/p/[projectId]">) {
  const { projectId } = await params
  const supabase = await createClient()

  // Row-level security decides: a private or taken-down project is simply
  // not found, signed in or not.
  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id, name, visibility")
    .eq("id", projectId)
    .eq("visibility", "public")
    .maybeSingle()
  if (!project) notFound()

  const [{ data: folders }, { data: documents }, { data: auth }] = await Promise.all([
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
    supabase.auth.getUser(),
  ])

  return (
    <>
      <header className="flex h-12 items-center gap-3 border-b px-4">
        <Link href="/" className="font-semibold">
          Subcanvas
        </Link>
        <Badge variant="secondary">
          <Globe />
          Public project
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <ReportAbuse projectId={project.id} />
          {!auth.user && (
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
          )}
        </div>
      </header>
      <SidebarProvider className="min-h-0 flex-1">
        <Sidebar collapsible="none" className="sticky top-0 h-[calc(100svh-3rem)] border-r">
          <SidebarContent>
            <ProjectTree
              project={{ slug: PUBLIC_SLUG, orgId: project.org_id, projectId: project.id }}
              projectName={project.name}
              nodes={buildTree(folders ?? [], documents ?? [])}
              canEdit={false}
              canUpgrade={false}
            />
          </SidebarContent>
        </Sidebar>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </SidebarProvider>
    </>
  )
}
