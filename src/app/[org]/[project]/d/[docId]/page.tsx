import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DocumentBreadcrumb, type Crumb } from "@/components/document-breadcrumb"
import { DocumentTitle } from "@/components/editor/document-title"
import { TextDocument } from "@/components/editor/text-document"
import { ReferencedBy } from "@/components/referenced-by"
import { ShareProject } from "@/components/share-project"
import { WhiteboardDocument } from "@/components/whiteboard/whiteboard-document"
import { parseVia } from "@/lib/navigation"
import { getOrgContext } from "@/lib/orgs"
import { hasRole } from "@/lib/roles"
import { userColor } from "@/lib/user-color"
import { cn } from "@/lib/utils"

export async function generateMetadata({
  params,
}: PageProps<"/[org]/[project]/d/[docId]">): Promise<Metadata> {
  const { org: slug, docId } = await params
  const { supabase } = await getOrgContext(slug)
  const { data } = await supabase.from("documents").select("title").eq("id", docId).maybeSingle()
  return { title: data?.title ?? "Document" }
}

export default async function DocumentPage({
  params,
  searchParams,
}: PageProps<"/[org]/[project]/d/[docId]">) {
  const { org: slug, project: projectId, docId } = await params
  const via = parseVia((await searchParams).via).filter((id) => id !== docId)
  const { supabase, user, org, role, canEdit } = await getOrgContext(slug)

  const [{ data: document }, { data: profile }, { data: project }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, type")
      .eq("id", docId)
      .eq("project_id", projectId)
      .eq("org_id", org.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase.from("projects").select("name, visibility").eq("id", projectId).maybeSingle(),
  ])
  if (!document || !project) notFound()

  // A document inside a trashed document is in the trash too.
  const { data: ancestors } = await supabase.rpc("document_ancestors", {
    p_document_id: document.id,
  })
  if (ancestors?.some((ancestor) => ancestor.deleted_at !== null)) notFound()

  // The trail the reader came by, or where the document lives when they
  // arrived by a plain link (R2.2, R2.3).
  let trail: Crumb[]
  if (via.length) {
    const { data: visited } = await supabase.from("documents").select("id, title").in("id", via)
    const titles = new Map(visited?.map((row) => [row.id, row.title]))
    trail = via.flatMap((id) => (titles.has(id) ? [{ id, title: titles.get(id)! }] : []))
  } else trail = (ancestors ?? []).map(({ id, title }) => ({ id, title }))

  const { data: referenceRows } = await supabase.rpc("document_references", {
    p_document_id: document.id,
  })
  const references = (referenceRows ?? []).map((row) => ({
    id: row.source_document_id,
    title: row.source_title,
    type: row.source_type,
    projectId: row.project_id,
  }))

  const projectPath = { slug: org.slug, projectId }
  const breadcrumb = (
    <DocumentBreadcrumb
      project={projectPath}
      projectName={project.name}
      trail={trail}
      current={document.title}
    />
  )
  const actions = (
    <div className="flex shrink-0 items-center gap-1.5">
      <ReferencedBy slug={org.slug} references={references} />
      <ShareProject
        project={{ slug: org.slug, orgId: org.id, projectId }}
        visibility={project.visibility}
        canChange={hasRole(role, "admin") && canEdit}
        whiteboard={document.type === "whiteboard" ? { docId: document.id, title: document.title } : undefined}
      />
    </div>
  )

  const editable = canEdit
  const editorUser = {
    id: user.id,
    name: profile?.display_name ?? user.email ?? "Someone",
    color: userColor(user.id),
  }
  const title = (compact: boolean) => (
    <DocumentTitle
      key={document.title}
      project={{ slug: org.slug, orgId: org.id, projectId }}
      documentId={document.id}
      title={document.title}
      editable={editable}
      compact={compact}
    />
  )

  if (document.type === "whiteboard")
    return (
      <main id="main" className={cn("flex h-svh flex-col bg-sheet max-md:h-[calc(100svh-41px)]", trail.length > 0 && "animate-sheet-enter")}>
        <WhiteboardDocument
          key={document.id}
          documentId={document.id}
          editable={editable}
          context={{
            orgId: org.id,
            projectId,
            whiteboardId: document.id,
            slug: org.slug,
            via: trail.map((crumb) => crumb.id),
          }}
          user={editorUser}
          breadcrumb={breadcrumb}
          title={title(true)}
          actions={actions}
        />
      </main>
    )

  return (
    <main id="main" className={cn("flex flex-1 flex-col bg-sheet", trail.length > 0 && "animate-sheet-enter")}>
      <TextDocument
        key={document.id}
        documentId={document.id}
        editable={editable}
        user={editorUser}
        context={{
          orgId: org.id,
          projectId,
          slug: org.slug,
          via: trail.map((crumb) => crumb.id),
        }}
        page={{ breadcrumb, actions, title: title(false) }}
      />
    </main>
  )
}
