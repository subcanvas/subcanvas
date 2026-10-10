import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { DocumentBreadcrumb, type Crumb } from "@/components/document-breadcrumb"
import { DocumentTitle } from "@/components/editor/document-title"
import { TextDocument } from "@/components/editor/text-document"
import { ReferencedBy } from "@/components/referenced-by"
import { ShareProject } from "@/components/share-project"
import { WhiteboardDocument } from "@/components/whiteboard/whiteboard-document"
import { readDocumentSource, readProjectSource } from "@/lib/github/source"
import { abuseContact } from "@/lib/legal"
import { codeFromSegment, documentHref, parseVia } from "@/lib/navigation"
import { privateDocumentLimit } from "@/lib/org-access"
import { getProjectAccess } from "@/lib/project-access"
import { hasRole } from "@/lib/roles"
import { userColor } from "@/lib/user-color"
import { cn } from "@/lib/utils"

// A whiteboard or page, at /<workspace>/<project>/<title>-<code>
// (lib/navigation.ts). Members get the editor; visitors to a public project
// the same components with editing off, read through row-level security.

async function findDocument(params: PageProps<"/[org]/[project]/[doc]">["params"]) {
  const { org: slug, project: projectParam, doc } = await params
  const code = codeFromSegment(doc)
  if (!code) notFound()
  const access = await getProjectAccess(slug, projectParam)
  const { data: document } = await access.supabase
    .from("documents")
    .select("id, code, title, type, source")
    .eq("project_id", access.project.id)
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle()
  if (!document) notFound()
  return { access, document, asked: { project: projectParam, doc } }
}

export async function generateMetadata({ params }: PageProps<"/[org]/[project]/[doc]">): Promise<Metadata> {
  const { document } = await findDocument(params)
  return { title: document.title }
}

export default async function DocumentPage({ params, searchParams }: PageProps<"/[org]/[project]/[doc]">) {
  const { access, document, asked } = await findDocument(params)
  const { supabase, project, path } = access
  const via = parseVia((await searchParams).via).filter((code) => code !== document.code)

  // An old name of the project, or the document's title before a rename:
  // the address that works now.
  const canonical = documentHref(path, document, via)
  if (`/${path.slug}/${asked.project}/${asked.doc}${via.length ? `?via=${via.join(".")}` : ""}` !== canonical)
    redirect(canonical)

  // A document inside a trashed document or folder is in the trash too.
  const [{ data: ancestors }, { data: live }] = await Promise.all([
    supabase.rpc("document_ancestors", { p_document_id: document.id }),
    supabase.rpc("document_is_live", { p_document_id: document.id }),
  ])
  if (!live) notFound()

  // The trail the reader came by, or where the document lives when they
  // arrived by a plain link (R2.2, R2.3).
  let trail: Crumb[]
  if (via.length) {
    const { data: visited } = await supabase
      .from("documents")
      .select("id, code, title")
      .eq("project_id", project.id)
      .in("code", via)
    const byCode = new Map(visited?.map((row) => [row.code, row]))
    trail = via.flatMap((code) => {
      const row = byCode.get(code)
      return row ? [{ id: row.id, title: row.title }] : []
    })
  } else trail = (ancestors ?? []).map(({ id, title }) => ({ id, title }))
  const trailIds = trail.map((crumb) => crumb.id)

  const { data: referenceRows } = await supabase.rpc("document_references", {
    p_document_id: document.id,
  })
  const references = (referenceRows ?? []).map((row) => ({
    id: row.source_document_id,
    title: row.source_title,
    type: row.source_type,
  }))

  const breadcrumb = <DocumentBreadcrumb projectName={project.name} trail={trail} current={document.title} />
  const source = readDocumentSource(document.source)
  const repository = readProjectSource(project.source)

  if (access.kind === "visitor") {
    const linkedFrom = <ReferencedBy references={references} />
    // Visitors never edit, so they need no identity beyond a label.
    const guest = { id: "guest", name: "Guest", color: "#888888" }
    const context = { orgId: project.org_id, projectId: project.id, slug: path.slug, via: trailIds }

    if (document.type === "whiteboard")
      return (
        <main id="main" className="flex h-[calc(100svh-3rem)] flex-col bg-sheet max-md:h-[calc(100svh-3rem-41px)]">
          <WhiteboardDocument
            key={document.id}
            documentId={document.id}
            editable={false}
            context={{ ...context, whiteboardId: document.id }}
            user={guest}
            repository={repository}
            breadcrumb={breadcrumb}
            title={<h1 className="truncate text-lg font-semibold">{document.title}</h1>}
            actions={linkedFrom}
          />
        </main>
      )

    return (
      <main id="main" className="flex flex-1 flex-col bg-sheet">
        <TextDocument
          key={document.id}
          documentId={document.id}
          editable={false}
          user={guest}
          context={context}
          source={source}
          page={{
            breadcrumb,
            actions: linkedFrom,
            title: <h1 className="px-13 text-4xl font-semibold tracking-tight">{document.title}</h1>,
          }}
        />
      </main>
    )
  }

  const { user, org, role, canEdit, plan } = access
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single()
  const projectRef = { ...path, orgId: org.id, projectId: project.id }

  const actions = (
    <div className="flex shrink-0 items-center gap-1.5">
      <ReferencedBy references={references} />
      <ShareProject
        project={projectRef}
        visibility={project.visibility}
        canChange={hasRole(role, "admin") && canEdit}
        privateLimit={privateDocumentLimit(plan)}
        current={{ id: document.id, title: document.title, type: document.type, via: trailIds }}
        takenDown={project.taken_down_at ? { contact: abuseContact() } : null}
      />
    </div>
  )

  // An imported document belongs to its repository, title included.
  const editable = canEdit && !source
  const editorUser = {
    id: user.id,
    name: profile?.display_name ?? user.email ?? "Someone",
    color: userColor(user.id),
    avatarUrl: profile?.avatar_url ?? null,
  }
  const title = (compact: boolean) => (
    <DocumentTitle
      key={document.title}
      project={projectRef}
      documentId={document.id}
      title={document.title}
      editable={editable}
      compact={compact}
    />
  )
  const context = { orgId: org.id, projectId: project.id, slug: org.slug, via: trailIds }

  if (document.type === "whiteboard")
    return (
      <main id="main" className={cn("flex h-svh flex-col bg-sheet max-md:h-[calc(100svh-41px)]", trail.length > 0 && "animate-sheet-enter")}>
        <WhiteboardDocument
          key={document.id}
          documentId={document.id}
          editable={editable}
          context={{ ...context, whiteboardId: document.id }}
          user={editorUser}
          repository={repository}
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
        context={context}
        source={source}
        page={{ breadcrumb, actions, title: title(false) }}
      />
    </main>
  )
}
