import { Globe, Lock } from "lucide-react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { getOrgContext } from "@/lib/orgs"
import { cn } from "@/lib/utils"

import { ImportProject } from "./import-project-form"
import { NewProject } from "./new-project-form"

// An import reads a whole repository before it answers.
export const maxDuration = 60

export default async function OrgPage({ params }: PageProps<"/[org]">) {
  const { org: slug } = await params
  const { supabase, org, canEdit } = await getOrgContext(slug)

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, visibility, documents(count)")
    .eq("org_id", org.id)
    .eq("documents.kind", "standard")
    .is("documents.deleted_at", null)
    .order("created_at")

  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <PageHeader
        eyebrow={org.name}
        title="Projects"
        action={
          canEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              <ImportProject slug={org.slug} />
              <NewProject slug={org.slug} orgId={org.id} />
            </div>
          )
        }
      />

      {projects?.length ? (
        <ul className="grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const count = project.documents[0]?.count ?? 0
            const isPublic = project.visibility === "public"
            const Icon = isPublic ? Globe : Lock
            return (
              <li key={project.id}>
                {/* A project that holds sheets is drawn as a stack of them. An empty one is a single sheet. */}
                <Link
                  href={`/${org.slug}/${project.id}`}
                  className={cn(
                    count > 0 && "sheet-stack",
                    "group flex h-32 flex-col justify-between rounded-lg border border-rule bg-sheet p-4 transition-[translate,border-color] outline-none [--stack-edge:var(--blueline)] hover:-translate-y-0.5 hover:border-cobalt focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <h2 className="line-clamp-2 text-lg leading-snug font-semibold">{project.name}</h2>
                  <p className="flex items-center justify-between font-mono text-[11px] tracking-wide text-graphite uppercase">
                    <span>
                      {count} {count === 1 ? "document" : "documents"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon className="size-3" aria-hidden />
                      {isPublic ? "Public" : "Private"}
                    </span>
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-rule px-6 py-16 text-center">
          <p className="font-heading text-xl font-semibold">No projects yet</p>
          <p className="max-w-sm text-sm text-graphite">
            {canEdit
              ? "A project is a set of whiteboards and documents that nest inside each other. Create one to start."
              : "When someone creates a project, it will show up here."}
          </p>
        </div>
      )}
    </main>
  )
}
