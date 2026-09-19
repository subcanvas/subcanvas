import { getOrgContext } from "@/lib/orgs"

import { TrashRow } from "./trash-row"

export default async function TrashPage({ params }: PageProps<"/[org]/[project]/trash">) {
  const { org: slug, project: projectId } = await params
  const { supabase, org, canEdit } = await getOrgContext(slug)

  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, type, deleted_at")
    .eq("project_id", projectId)
    .eq("org_id", org.id)
    .eq("kind", "standard")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
        <p className="text-sm text-muted-foreground">
          Documents nested inside a trashed document come back with it.
        </p>
      </div>

      {documents?.length ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {documents.map((document) => (
            <TrashRow
              key={document.id}
              project={{ slug: org.slug, orgId: org.id, projectId }}
              id={document.id}
              title={document.title}
              canEdit={canEdit}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">The trash is empty.</p>
      )}
    </main>
  )
}
