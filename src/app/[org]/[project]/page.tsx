import { notFound } from "next/navigation"

import { ShareProject } from "@/components/share-project"
import { getOrgContext } from "@/lib/orgs"
import { hasRole } from "@/lib/roles"

export default async function ProjectPage({ params }: PageProps<"/[org]/[project]">) {
  const { org: slug, project: projectId } = await params
  const { supabase, org, role, canEdit } = await getOrgContext(slug)
  const { data: project } = await supabase
    .from("projects")
    .select("visibility")
    .eq("id", projectId)
    .eq("org_id", org.id)
    .maybeSingle()
  if (!project) notFound()

  return (
    <main id="main" className="flex flex-1 flex-col">
      <div className="flex justify-end px-4 py-2">
        <ShareProject
          project={{ slug: org.slug, orgId: org.id, projectId }}
          visibility={project.visibility}
          canChange={hasRole(role, "admin") && canEdit}
        />
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <p className="font-heading text-xl font-semibold">Pick a sheet</p>
          <p className="text-sm leading-relaxed text-graphite">
            Choose a document on the left, or use + to add a whiteboard or a page of notes.
          </p>
        </div>
      </div>
    </main>
  )
}
