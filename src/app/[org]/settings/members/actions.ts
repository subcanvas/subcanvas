"use server"

import { revalidatePath } from "next/cache"

import { EDITOR_LIMIT_MESSAGE, limitMessage } from "@/lib/billing/limit"
import { syncSeats } from "@/lib/billing/stripe"
import { ROLES, type Role } from "@/lib/roles"
import { createClient } from "@/lib/supabase/server"

// Every action relies on RLS for authorization. When a policy filters the
// row out, the write affects nothing, which is reported as "not allowed".

export type ActionResult = { error: string } | { ok: true }

const NOT_ALLOWED = { error: "You do not have permission to do that." }

function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role)
}

export async function changeRole(
  slug: string,
  orgId: string,
  userId: string,
  role: string
): Promise<ActionResult> {
  if (!isRole(role)) return { error: "Unknown role." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("org_members")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .select("user_id")

  if (error)
    return error.code === "42501"
      ? NOT_ALLOWED
      : { error: limitMessage(error.code) ?? error.message }
  if (!data.length) return NOT_ALLOWED

  await syncSeats(orgId)
  revalidatePath(`/${slug}/settings/members`)
  return { ok: true }
}

export async function removeMember(
  slug: string,
  orgId: string,
  userId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("org_members")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .select("user_id")

  if (error) return { error: error.message }
  if (!data.length) return NOT_ALLOWED

  await syncSeats(orgId)
  revalidatePath(`/${slug}/settings/members`)
  return { ok: true }
}

export async function createInvite(
  slug: string,
  orgId: string,
  email: string,
  role: string
): Promise<ActionResult> {
  if (!isRole(role) || role === "owner") return { error: "Unknown role." }

  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    return { error: "Enter a valid email address." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NOT_ALLOWED

  // Say so now rather than when the invited person tries to accept.
  if (role !== "viewer") {
    const { data: usage } = await supabase.rpc("org_usage", { p_org_id: orgId })
    const plan = usage?.[0]
    if (plan && !plan.paid && plan.editor_limit != null && plan.editors >= plan.editor_limit)
      return { error: EDITOR_LIMIT_MESSAGE }
  }

  const { error } = await supabase
    .from("org_invites")
    .insert({ org_id: orgId, email: normalized, role, invited_by: user.id })

  if (error) {
    if (error.code === "23505") return { error: "That email already has an invite." }
    if (error.code === "42501") return NOT_ALLOWED
    return { error: error.message }
  }

  revalidatePath(`/${slug}/settings/members`)
  return { ok: true }
}

export async function revokeInvite(
  slug: string,
  inviteId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("org_invites")
    .delete()
    .eq("id", inviteId)
    .select("id")

  if (error) return { error: error.message }
  if (!data.length) return NOT_ALLOWED

  revalidatePath(`/${slug}/settings/members`)
  return { ok: true }
}
