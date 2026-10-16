"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { recordStep } from "@/lib/activity"
import * as operations from "@/lib/documents/operations"
import { gitHubAppConfig } from "@/lib/github/app"
import { importFromReference } from "@/lib/github/import-reference"
import type { ImportRefusal } from "@/lib/github/import-repository"
import { connectedRepositories } from "@/lib/github/installations"
import { projectHref } from "@/lib/navigation"
import { getOrgContext } from "@/lib/orgs"
import { hasRole } from "@/lib/roles"
import { addressOfDocument } from "@/lib/project-access"
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

  const { data: created } = await supabase.from("projects").select("slug").eq("id", result.id).maybeSingle()
  redirect(projectHref({ slug, project: created?.slug ?? result.id }))
}

// `limit` marks the free-tier limit, so the dialog can say what to do.
export type ImportState =
  // `reason`: why it was refused (lib/github/import-repository.ts), which
  // tells the dialog when connecting GitHub would help.
  | { error: string; limit?: true; reason?: ImportRefusal }
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

  const href =
    (await addressOfDocument(supabase, outcome.documentId, undefined)) ??
    `/${slug}/${outcome.projectId}/d/${outcome.documentId}`
  if (!outcome.warnings.length) {
    revalidatePath(`/${slug}`)
    redirect(href)
  }
  // The page is not refreshed under the notes: in an org with no projects
  // the dialog is part of the empty page, and the refreshed page, which
  // lists the new project instead, would close it before they were read.
  // The dialog refreshes the page when it closes.
  return { ok: true, href, folders: outcome.folders, warnings: outcome.warnings }
}

// What the import dialog offers beyond public repositories: the ones this
// workspace's GitHub connections can read (Connect GitHub), and whether the
// person could connect one. Nothing when this server has no GitHub App.
export type GitHubChoices = {
  connectable: boolean
  canConnect: boolean
  repositories: { repository: string; private: boolean }[]
  broken: string[]
}

export async function gitHubChoices(slug: string): Promise<GitHubChoices> {
  const { supabase, org, role } = await getOrgContext(slug)
  if (!gitHubAppConfig()) return { connectable: false, canConnect: false, repositories: [], broken: [] }
  const { repositories, broken } = await connectedRepositories(supabase, org.id)
  return {
    connectable: true,
    canConnect: hasRole(role, "admin"),
    repositories: repositories.map(({ repository, private: isPrivate }) => ({ repository, private: isPrivate })),
    broken,
  }
}

// The step record (lib/activity.ts): the person opened Import from GitHub.
// The dialog makes no other trip to the server until something is imported,
// so it says so itself. Records only their own step, and nothing about them.
export async function openedGitHubImport() {
  await recordStep(await createClient(), "opened_github_import")
}
