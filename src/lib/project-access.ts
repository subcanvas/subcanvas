import type { SupabaseClient } from "@supabase/supabase-js"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { signedOut } from "@/lib/auth"
import { documentHref, parseVia, type ProjectPath } from "@/lib/navigation"
import { findOrgContext } from "@/lib/orgs"
import type { Database } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"

// Who is opening the project at /<workspace>/<project>, and the project. A
// member gets the app; anyone else gets the read-only view of a public
// project at the same address (lib/navigation.ts). Someone signed out who
// asks for a project they cannot see is sent to sign in, and comes back to
// it; anyone else gets "not found", whether or not it exists.
//
// `path` is where the project lives now. The address asked for may differ:
// a name the project had before it was renamed, or its id in an address
// from before short names. Pages send the reader on to `path`.
export const getProjectAccess = cache(async (workspace: string, project: string) => {
  const supabase = await createClient()
  const [{ data: found }, member] = await Promise.all([
    supabase.rpc("find_project", { p_workspace: workspace, p_project: project }).maybeSingle(),
    findOrgContext(workspace),
  ])

  if (!found) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (!user) {
      if (!signedOut(error)) throw error
      redirect(`/login?next=${encodeURIComponent(`/${workspace}/${project}`)}`)
    }
    notFound()
  }

  const path: ProjectPath = { slug: workspace, project: found.slug }

  if (found.member && member) {
    const { data: row } = await member.supabase
      .from("projects")
      .select("id, org_id, name, visibility, taken_down_at, source")
      .eq("id", found.project_id)
      .single()
    if (!row) notFound()
    return {
      kind: "member" as const,
      ...member,
      path,
      project: { ...row, slug: found.slug },
    }
  }

  // Row-level security decides again: only a public project is readable here.
  const { data: row } = await supabase
    .from("projects")
    .select("id, org_id, name, visibility, source")
    .eq("id", found.project_id)
    .eq("visibility", "public")
    .maybeSingle()
  if (!row) notFound()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return {
    kind: "visitor" as const,
    supabase,
    user,
    path,
    // A taken-down project is not public, so a visitor never sees one.
    project: { ...row, slug: found.slug, taken_down_at: null },
  }
})

export type ProjectAccess = Awaited<ReturnType<typeof getProjectAccess>>

// The readable address of a document named by its id, as in an address from
// before readable ones (/p/<project>/d/<id>, /<workspace>/<project>/d/<id>)
// or a link saved inside a document. `via` may hold ids, as those did, or
// codes. Null when the reader cannot see the document.
export async function addressOfDocument(
  supabase: SupabaseClient<Database>,
  documentId: string,
  via: string | string[] | undefined
) {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null
  const { data: document } = await supabase
    .from("documents")
    .select("code, title, project_id")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!document) return null
  const { data: where } = await supabase
    .rpc("project_address", { p_project_id: document.project_id })
    .maybeSingle()
  if (!where) return null

  const raw = (Array.isArray(via) ? via[0] : via)?.split(".") ?? []
  const ids = raw.filter((part) => /^[0-9a-f-]{36}$/i.test(part))
  const codes = new Map<string, string>()
  if (ids.length) {
    const { data: visited } = await supabase
      .from("documents")
      .select("id, code")
      .eq("project_id", document.project_id)
      .in("id", ids)
    for (const row of visited ?? []) codes.set(row.id, row.code)
  }
  const trail = parseVia(raw.map((part) => codes.get(part) ?? part).join("."))

  return documentHref({ slug: where.workspace, project: where.project }, document, trail)
}
