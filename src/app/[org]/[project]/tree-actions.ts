"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import * as operations from "@/lib/documents/operations"
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

export async function trashDocument(project: ProjectRef, id: string): Promise<ActionResult> {
  const supabase = await createClient()
  return finish(project, await operations.trashDocument(supabase, id))
}

export async function restoreDocument(project: ProjectRef, id: string): Promise<ActionResult> {
  const supabase = await createClient()
  return finish(project, await operations.restoreDocument(supabase, id))
}

export async function deleteDocumentForever(
  project: ProjectRef,
  id: string
): Promise<ActionResult> {
  const supabase = await createClient()
  return finish(project, await operations.deleteDocumentForever(supabase, id))
}

export async function deleteFolder(project: ProjectRef, id: string): Promise<ActionResult> {
  const supabase = await createClient()
  return finish(project, await operations.deleteFolder(supabase, id))
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
