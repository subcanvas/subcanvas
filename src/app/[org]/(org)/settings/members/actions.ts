"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { editorLimitMessage, limitMessage } from "@/lib/billing/limit"
import { syncSeats } from "@/lib/billing/stripe"
import { emailConfigured, sendEmail, type SendResult } from "@/lib/email"
import { inviteEmail } from "@/lib/email-messages"
import { originFromHeaders } from "@/lib/origin"
import { ROLES, type Role } from "@/lib/roles"
import { createClient } from "@/lib/supabase/server"

// Every action relies on RLS for authorization. When a policy filters the
// row out, the write affects nothing, which is reported as "not allowed".

// `limit` marks the free plan's editor limit, so the page can say what to do.
export type ActionResult = { error: string; limit?: true } | { ok: true }

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

  if (error) {
    if (error.code === "42501") return NOT_ALLOWED
    const limit = limitMessage(error.code, error.message)
    return limit ? { error: limit, limit: true } : { error: error.message }
  }
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

// What became of an invite's email: sent, not sent because this server
// sends none, tried without success, or held back because the admin has
// emailed as many invites today as a day allows (create_invite in the
// database counts them).
export type InviteDelivery = SendResult | "limit"

export type InviteResult =
  | { error: string; limit?: true }
  | { ok: true; email: string; renewed: boolean; delivery: InviteDelivery }

export async function createInvite(
  slug: string,
  orgId: string,
  email: string,
  role: string
): Promise<InviteResult> {
  if (!isRole(role) || role === "owner") return { error: "Unknown role." }

  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    return { error: "Enter a valid email address." }

  return invite(slug, orgId, normalized, role)
}

// An invite, open or expired, renewed for another 7 days and sent again.
export async function resendInvite(slug: string, inviteId: string): Promise<InviteResult> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("org_invites")
    .select("org_id, email, role")
    .eq("id", inviteId)
    .maybeSingle()
  if (!existing || existing.role === "owner") return NOT_ALLOWED

  return invite(slug, existing.org_id, existing.email, existing.role)
}

// Makes or renews the invite, then emails it when this server sends email.
// A failed email loses nothing: the invite is made first, and its link is
// on the Members page to copy.
async function invite(
  slug: string,
  orgId: string,
  email: string,
  role: Exclude<Role, "owner">
): Promise<InviteResult> {
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
      return { error: editorLimitMessage(plan.editor_limit), limit: true }
  }

  const { data, error } = await supabase.rpc("create_invite", {
    p_org_id: orgId,
    p_email: email,
    p_role: role,
  })
  if (error) return error.code === "42501" ? NOT_ALLOWED : { error: error.message }
  const created = data[0]
  revalidatePath(`/${slug}/settings/members`)

  const result = { ok: true as const, email, renewed: created.renewed }
  if (!emailConfigured()) return { ...result, delivery: "off" }
  if (!created.may_email) return { ...result, delivery: "limit" }

  const [{ data: org }, { data: profile }] = await Promise.all([
    supabase.from("orgs").select("name").eq("id", orgId).single(),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
  ])
  const origin = originFromHeaders(await headers())
  const delivery = await sendEmail({
    to: email,
    ...inviteEmail({
      inviter: profile?.display_name ?? user.email ?? "Someone",
      workspace: org?.name ?? slug,
      role,
      email,
      link: `${origin}/invite/${created.token}`,
      expiresAt: new Date(created.expires_at),
    }),
  })
  return { ...result, delivery }
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
