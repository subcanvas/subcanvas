"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import * as operations from "@/lib/documents/operations"
import { importFromReference } from "@/lib/github/import-reference"
import { getOrgContext } from "@/lib/orgs"
import { createClient } from "@/lib/supabase/server"

export type FormState = { error: string } | null

export async function createProject(
  slug: string,
  orgId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const visibility = formData.get("visibility") === "public" ? "public" : "private"

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const result = await operations.createProject(supabase, {
    orgId,
    userId: user?.id,
    name: String(formData.get("name") ?? ""),
    visibility,
  })
  if ("error" in result) return { error: result.error }

  redirect(`/${slug}/${result.id}`)
}

// `limit` marks the free-tier limit, so the dialog can say what to do.
export type ImportState =
  | { error: string; limit?: true }
  | { ok: true; href: string; folders: number; warnings: string[] }
  | null

// Draws a public GitHub repository as a new project. With nothing to report
// it goes straight to the top whiteboard; otherwise the dialog shows what
// was left out first.
export async function importFromGitHub(
  slug: string,
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const { supabase, user, org } = await getOrgContext(slug)
  const outcome = await importFromReference(supabase, {
    orgId: org.id,
    userId: user.id,
    repository: String(formData.get("repository") ?? ""),
    makePublic: formData.get("public") === "on",
  })
  if ("error" in outcome) return outcome

  revalidatePath(`/${slug}`)
  const href = `/${slug}/${outcome.projectId}/d/${outcome.documentId}`
  if (!outcome.warnings.length) redirect(href)
  return { ok: true, href, folders: outcome.folders, warnings: outcome.warnings }
}
