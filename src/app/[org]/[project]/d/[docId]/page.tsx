import { notFound } from "next/navigation"

import { DocumentTitle } from "@/components/editor/document-title"
import { TextDocument } from "@/components/editor/text-document"
import { WhiteboardDocument } from "@/components/whiteboard/whiteboard-document"
import { getOrgContext } from "@/lib/orgs"
import { hasRole } from "@/lib/roles"
import { userColor } from "@/lib/user-color"

export default async function DocumentPage({
  params,
}: PageProps<"/[org]/[project]/d/[docId]">) {
  const { org: slug, project: projectId, docId } = await params
  const { supabase, user, org, role } = await getOrgContext(slug)

  const [{ data: document }, { data: profile }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, type")
      .eq("id", docId)
      .eq("project_id", projectId)
      .eq("org_id", org.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
  ])
  if (!document) notFound()

  // A document inside a trashed document is in the trash too.
  const { data: ancestors } = await supabase.rpc("document_ancestors", {
    p_document_id: document.id,
  })
  if (ancestors?.some((ancestor) => ancestor.deleted_at !== null)) notFound()

  const editable = hasRole(role, "editor")
  const editorUser = {
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
      <main className="flex h-[calc(100svh-3rem)] flex-col">
        <WhiteboardDocument
          key={document.id}
          documentId={document.id}
          editable={editable}
          context={{ orgId: org.id, projectId, whiteboardId: document.id }}
          user={editorUser}
          header={title(true)}
        />
      </main>
    )

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
      {title(false)}
      <TextDocument
        key={document.id}
        documentId={document.id}
        editable={editable}
        user={editorUser}
      />
    </main>
  )
}
