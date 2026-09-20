"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createFixtureProvider, FIXTURE_OWNER, fixturesFolder } from "@/lib/github/fixture-provider"
import { createGitHubProvider, gitHubAppCredentials } from "@/lib/github/github-provider"
import { importRepository } from "@/lib/github/import-repository"
import { parseRepositoryReference } from "@/lib/github/reference"
import { getOrgContext } from "@/lib/orgs"
import { createClient } from "@/lib/supabase/server"

export type FormState = { error: string } | null

export async function createProject(
  slug: string,
  orgId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { error: "Enter a project name." }
  const visibility = formData.get("visibility") === "public" ? "public" : "private"

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ org_id: orgId, name, visibility, created_by: user?.id })
    .select("id")
    .single()

  if (error)
    return {
      error:
        error.code === "42501"
          ? "You do not have permission to create projects."
          : error.message,
    }

  redirect(`/${slug}/${project.id}`)
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
  const reference = parseRepositoryReference(String(formData.get("repository") ?? ""))
  if (!reference)
    return { error: "Enter a GitHub repository as owner/name, or paste its address." }

  // Checked before GitHub is asked anything. The database checks again.
  const { supabase, user, org, canEdit } = await getOrgContext(slug)
  if (!canEdit) return { error: "You do not have permission to create projects." }

  const fixtures = fixturesFolder()
  const provider =
    fixtures && reference.owner === FIXTURE_OWNER
      ? createFixtureProvider(fixtures)
      : createGitHubProvider(gitHubAppCredentials())

  const outcome = await importRepository(supabase, provider, reference, {
    orgId: org.id,
    userId: user.id,
    makePublic: formData.get("public") === "on",
  })
  if ("error" in outcome) return outcome

  revalidatePath(`/${slug}`)
  const href = `/${slug}/${outcome.projectId}/d/${outcome.documentId}`
  if (!outcome.warnings.length) redirect(href)
  return { ok: true, href, folders: outcome.folders, warnings: outcome.warnings }
}
