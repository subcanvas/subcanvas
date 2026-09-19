import Link from "next/link"
import { notFound } from "next/navigation"

import { getOrgContext } from "@/lib/orgs"
import { hasRole } from "@/lib/roles"

import { NewDocumentButton } from "./new-document-button"

export default async function ProjectPage({
  params,
}: PageProps<"/[org]/[project]">) {
  const { org: slug, project: projectId } = await params
  const { supabase, org, role } = await getOrgContext(slug)

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .eq("org_id", org.id)
    .maybeSingle()
  if (!project) notFound()

  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, type")
    .eq("project_id", project.id)
    .is("deleted_at", null)
    .order("created_at")

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        {hasRole(role, "editor") && (
          <NewDocumentButton slug={org.slug} orgId={org.id} projectId={project.id} />
        )}
      </div>

      {documents?.length ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {documents.map((document) => (
            <li key={document.id}>
              <Link
                href={`/${org.slug}/${project.id}/d/${document.id}`}
                className="block px-4 py-3 font-medium hover:bg-muted"
              >
                {document.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No documents yet.</p>
      )}
    </main>
  )
}
