"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type DisconnectResult = { error: string } | { ok: true }

// Stops this workspace importing from a GitHub connection. Row-level
// security lets only admins delete one; when it filters the row out, nothing
// is deleted, which is reported as not allowed. The app stays installed on
// GitHub, where it may serve other workspaces, until it is uninstalled there.
export async function disconnectGitHub(slug: string, orgId: string, installationId: number): Promise<DisconnectResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("github_connections")
    .delete()
    .eq("org_id", orgId)
    .eq("installation_id", installationId)
    .select("installation_id")
  if (error) return { error: error.message }
  if (!data.length) return { error: "You do not have permission to do that." }
  revalidatePath(`/${slug}/settings/github`)
  return { ok: true }
}
