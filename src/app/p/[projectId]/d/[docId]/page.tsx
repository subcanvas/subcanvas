import { notFound } from "next/navigation"

import { DocumentBreadcrumb, type Crumb } from "@/components/document-breadcrumb"
import { TextDocument } from "@/components/editor/text-document"
import { ReferencedBy } from "@/components/referenced-by"
import { WhiteboardDocument } from "@/components/whiteboard/whiteboard-document"
import { parseVia } from "@/lib/navigation"
import { PUBLIC_SLUG } from "@/lib/public-route"
import { createClient } from "@/lib/supabase/server"

// The read-only page anyone can open for a document in a public project.
// It renders the same components as the app with editing off; row-level
// security is what lets an anonymous visitor read, and only read.
export default async function PublicDocumentPage({
  params,
  searchParams,
}: PageProps<"/p/[projectId]/d/[docId]">) {
  const { projectId, docId } = await params
  const via = parseVia((await searchParams).via).filter((id) => id !== docId)
  const supabase = await createClient()

  const [{ data: document }, { data: project }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, org_id, title, type")
      .eq("id", docId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .eq("visibility", "public")
      .maybeSingle(),
  ])
  if (!document || !project) notFound()

  const { data: ancestors } = await supabase.rpc("document_ancestors", {
    p_document_id: document.id,
  })
  if (ancestors?.some((ancestor) => ancestor.deleted_at !== null)) notFound()

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

  const breadcrumb = (
    <DocumentBreadcrumb
      project={{ slug: PUBLIC_SLUG, projectId }}
      projectName={project.name}
      trail={trail}
      current={document.title}
    />
  )
  const linkedFrom = <ReferencedBy slug={PUBLIC_SLUG} references={references} />
  // Visitors never edit, so they need no identity beyond a label.
  const guest = { id: "guest", name: "Guest", color: "#888888" }
  const trailIds = trail.map((crumb) => crumb.id)

  if (document.type === "whiteboard")
    return (
      <main className="flex h-[calc(100svh-3rem)] flex-col">
        <WhiteboardDocument
          key={document.id}
          documentId={document.id}
          editable={false}
          context={{
            orgId: document.org_id,
            projectId,
            whiteboardId: document.id,
            slug: PUBLIC_SLUG,
            via: trailIds,
          }}
          user={guest}
          header={
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {breadcrumb}
                <h1 className="truncate text-lg font-semibold">{document.title}</h1>
              </div>
              {linkedFrom}
            </div>
          }
        />
      </main>
    )

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
      <div className="flex items-center justify-between gap-3 px-13">
        {breadcrumb}
        {linkedFrom}
      </div>
      <h1 className="px-13 text-3xl font-semibold tracking-tight">{document.title}</h1>
      <TextDocument
        key={document.id}
        documentId={document.id}
        editable={false}
        user={guest}
        context={{ orgId: document.org_id, projectId, slug: PUBLIC_SLUG, via: trailIds }}
      />
    </main>
  )
}
