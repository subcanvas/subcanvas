import { notFound } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { getProjectAccess } from "@/lib/project-access"

import { TrashRow, type TrashedItem } from "./trash-row"

export const metadata = { title: "Trash" }

export default async function TrashPage({ params }: PageProps<"/[org]/[project]/trash">) {
  const { org: slug, project: projectParam } = await params
  const access = await getProjectAccess(slug, projectParam)
  // A visitor to a public project sees what is in it, not what was.
  if (access.kind !== "member") notFound()
  const { supabase, org, canEdit, path } = access
  const projectId = access.project.id

  // What was put in the trash, not what went with it: a folder's documents
  // and a document's nested ones come back with it and are not listed.
  const [{ data: folders }, { data: documents }] = await Promise.all([
    supabase
      .from("folders")
      .select("id, name, deleted_at")
      .eq("project_id", projectId)
      .eq("org_id", org.id)
      .not("deleted_at", "is", null),
    supabase
      .from("documents")
      .select("id, title, type, kind, deleted_at")
      .eq("project_id", projectId)
      .eq("org_id", org.id)
      .not("deleted_at", "is", null),
  ])
  const items: (TrashedItem & { deletedAt: string })[] = [
    ...(folders ?? []).map((folder) => ({
      kind: "folder" as const,
      id: folder.id,
      title: folder.name,
      what: "folder" as const,
      deletedAt: folder.deleted_at!,
    })),
    // A description is the notes of a box or an arrow, in the trash because
    // that was deleted.
    ...(documents ?? []).map((document) => ({
      kind: "document" as const,
      id: document.id,
      title: document.title,
      what: document.kind === "description" ? ("notes" as const) : document.type,
      deletedAt: document.deleted_at!,
    })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <PageHeader
        title="Trash"
        description="Restore something to put it back where it was, with everything that was inside it. Deleting it forever cannot be undone."
      />

      {items.length ? (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border border-rule bg-sheet">
          {items.map((item) => (
            <TrashRow
              key={item.id}
              project={{ ...path, orgId: org.id, projectId }}
              item={item}
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
