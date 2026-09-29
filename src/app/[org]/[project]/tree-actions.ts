"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import * as operations from "@/lib/documents/operations"
import type { ItemKind } from "@/lib/documents/operations"
import { createClient } from "@/lib/supabase/server"
import type { Container, DocumentType } from "@/lib/tree"

// The work itself is in lib/documents/operations, shared with the MCP
// server. An action adds what only the web app needs: the session from
// cookies, revalidation, and redirects.

export type ProjectRef = { slug: string; orgId: string; projectId: string }
// `limit` marks the free-tier limit, so the client can offer the upgrade.
export type ActionResult = { error: string; limit?: true } | { ok: true }

function refresh({ slug, projectId }: ProjectRef) {
  revalidatePath(`/${slug}/${projectId}`, "layout")
}

// Revalidates when the operation worked, and passes its result on.
function finish<T extends operations.OperationResult>(project: ProjectRef, result: T) {
  if ("ok" in result) refresh(project)
  return result
}

export async function createFolder(
  project: ProjectRef,
  parentFolderId: string | null
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient()
  return finish(project, await operations.createFolder(supabase, project, parentFolderId))
}

export async function createDocument(
  project: ProjectRef,
  type: DocumentType,
  container: Container
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const result = await operations.createDocument(supabase, project, user?.id, type, container)
  if ("error" in result) return result

  refresh(project)
  redirect(`/${project.slug}/${project.projectId}/d/${result.id}`)
}

export async function renameItem(
  project: ProjectRef,
  kind: "folder" | "document",
  id: string,
  name: string
): Promise<ActionResult> {
  const supabase = await createClient()
  return finish(project, await operations.renameItem(supabase, kind, id, name))
}

export async function moveItem(
  project: ProjectRef,
  kind: "folder" | "document",
  id: string,
  target: Container
): Promise<ActionResult> {
  const supabase = await createClient()
  return finish(project, await operations.moveItem(supabase, kind, id, target))
}

export async function listReferences(id: string): Promise<string[]> {
  return operations.listReferences(await createClient(), id)
}

export async function trashItem(project: ProjectRef, kind: ItemKind, id: string): Promise<ActionResult> {
  const supabase = await createClient()
  return finish(project, await operations.trashItem(supabase, kind, id))
}

export async function restoreItem(
  project: ProjectRef,
  kind: ItemKind,
  id: string
): Promise<ActionResult & Partial<operations.Restored>> {
  const supabase = await createClient()
  return finish(project, await operations.restoreItem(supabase, kind, id))
}

export async function deleteItemForever(project: ProjectRef, kind: ItemKind, id: string): Promise<ActionResult> {
  const supabase = await createClient()
  return finish(project, await operations.deleteItemForever(supabase, kind, id))
}

export async function setProjectVisibility(
  project: ProjectRef,
  visibility: "private" | "public"
): Promise<ActionResult> {
  const supabase = await createClient()
  return finish(
    project,
    await operations.setProjectVisibility(supabase, project.projectId, visibility)
  )
}

export async function renameProject(project: ProjectRef, name: string): Promise<ActionResult> {
  const supabase = await createClient()
  const result = await operations.renameProject(supabase, project.projectId, name)
  // The name is in the sidebar, the page titles, and the org's project list.
  if ("ok" in result) revalidatePath(`/${project.slug}`, "layout")
  return result
}

// The dialog goes to the org's projects when this says ok, as deleting an
// org does: the page it was opened on is gone.
export async function deleteProject(project: ProjectRef, confirmation: string): Promise<ActionResult> {
  const supabase = await createClient()
  const result = await operations.deleteProject(supabase, project.projectId, confirmation)
  if ("ok" in result) revalidatePath(`/${project.slug}`, "layout")
  return result
}

