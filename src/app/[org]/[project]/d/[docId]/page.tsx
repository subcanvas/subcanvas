import { notFound } from "next/navigation"

import { TextDocument } from "@/components/editor/text-document"
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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
      <h1 className="px-13 text-3xl font-semibold tracking-tight">{document.title}</h1>
      {document.type === "text" ? (
        <TextDocument
          documentId={document.id}
          editable={hasRole(role, "editor")}
          user={{
            name: profile?.display_name ?? user.email ?? "Someone",
            color: userColor(user.id),
          }}
        />
      ) : (
        <p className="px-13 text-muted-foreground">Whiteboards arrive in milestone 4.</p>
      )}
    </main>
  )
}
