import Link from "next/link"

import { getOrgContext } from "@/lib/orgs"
import { hasRole } from "@/lib/roles"

import { NewProjectForm } from "./new-project-form"

export default async function OrgPage({ params }: PageProps<"/[org]">) {
  const { org: slug } = await params
  const { supabase, org, role } = await getOrgContext(slug)

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("org_id", org.id)
    .order("created_at")

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>

      {projects?.length ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/${org.slug}/${project.id}`}
                className="block px-4 py-3 font-medium hover:bg-muted"
              >
                {project.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No projects yet.</p>
      )}

      {hasRole(role, "editor") && <NewProjectForm slug={org.slug} orgId={org.id} />}
    </main>
  )
}
