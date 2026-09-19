import { PageHeader } from "@/components/page-header"
import { getOrgContext } from "@/lib/orgs"

import { TrashRow } from "./trash-row"

export const metadata = { title: "Trash" }

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
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <PageHeader
        title="Trash"
        description="Restore a document to put it back where it was. Anything nested inside it comes back with it."
      />

      {documents?.length ? (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border border-rule bg-sheet">
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
        <p className="rounded-xl border border-dashed border-rule px-6 py-12 text-center text-sm text-graphite">
          The trash is empty.
        </p>
      )}
    </main>
  )
}
