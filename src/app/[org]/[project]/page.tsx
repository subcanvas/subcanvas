import { redirect } from "next/navigation"

import { ShareProject } from "@/components/share-project"
import { abuseContact } from "@/lib/legal"
import { documentHref, projectHref } from "@/lib/navigation"
import { privateDocumentLimit } from "@/lib/org-access"
import { getProjectAccess } from "@/lib/project-access"
import { hasRole } from "@/lib/roles"

// A project's address opens its first whiteboard or page, the top of its
// list, so the link a person shares shows something. A project with nothing
// in it says so.
export default async function ProjectPage({ params }: PageProps<"/[org]/[project]">) {
  const { org: slug, project: projectParam } = await params
  const access = await getProjectAccess(slug, projectParam)
  const { supabase, project, path } = access
  if (projectParam !== path.project) redirect(projectHref(path))

  const { data: first } = await supabase
    .from("documents")
    .select("code, title")
    .eq("project_id", project.id)
    .eq("kind", "standard")
    .is("folder_id", null)
    .is("parent_document_id", null)
    .is("deleted_at", null)
    .order("position")
    .limit(1)
    .maybeSingle()
  if (first) redirect(documentHref(path, first))

  if (access.kind === "visitor")
    return (
      <main id="main" className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground">There is nothing in this project yet.</p>
      </main>
    )

  const { org, role, canEdit, plan } = access
  return (
    <main id="main" className="flex flex-1 flex-col">
      <div className="flex justify-end px-4 py-2">
        <ShareProject
          project={{ ...path, orgId: org.id, projectId: project.id }}
          visibility={project.visibility}
          canChange={hasRole(role, "admin") && canEdit}
          privateLimit={privateDocumentLimit(plan)}
          takenDown={project.taken_down_at ? { contact: abuseContact() } : null}
        />
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <p className="font-heading text-xl font-semibold">Open a whiteboard or a page</p>
          <p className="text-sm leading-relaxed text-graphite">
            Choose one from the list, or use + to add a new whiteboard or page.
          </p>
        </div>
      </div>
    </main>
  )
}
