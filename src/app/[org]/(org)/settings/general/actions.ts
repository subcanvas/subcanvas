"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

import { removeMember } from "../members/actions"

// Authorization is RLS: admins rename, owners delete, anyone leaves. A write
// that a policy filters out affects nothing, which is reported as "not
// allowed". Two triggers say no on their own terms: an org keeps at least
// one owner, and an org with a running subscription cannot be deleted.

export type ActionResult = { error: string } | { ok: true }

const NOT_ALLOWED = { error: "You do not have permission to do that." }

export async function renameOrg(orgId: string, name: string): Promise<ActionResult> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 80) return { error: "A name is 1 to 80 characters." }

  const supabase = await createClient()
  const { data, error } = await supabase.from("orgs").update({ name: trimmed }).eq("id", orgId).select("id")
  if (error) return error.code === "42501" ? NOT_ALLOWED : { error: error.message }
  if (!data.length) return NOT_ALLOWED

  // The name is in the sidebar and the heading of every page of the org.
  revalidatePath("/[org]", "layout")
  return { ok: true }
}

export async function leaveOrg(slug: string, orgId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NOT_ALLOWED

  return removeMember(slug, orgId, user.id)
}

// `confirmation` is the org's name as the person typed it. It is compared
// here as well as in the dialog, so nothing but a deliberate request deletes.
export async function deleteOrg(orgId: string, confirmation: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: org } = await supabase.from("orgs").select("name").eq("id", orgId).maybeSingle()
  if (!org) return NOT_ALLOWED
  if (confirmation.trim() !== org.name) return { error: "That is not the org's name." }

  const { data, error } = await supabase.from("orgs").delete().eq("id", orgId).select("id")
  if (error) return { error: error.message }
  if (!data.length) return NOT_ALLOWED

  revalidatePath("/[org]", "layout")
  return { ok: true }
}
