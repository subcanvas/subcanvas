"use server"

import type { User } from "@supabase/supabase-js"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { billingConfigured, getStripe } from "@/lib/billing/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type BillingState = { error: string } | null

// Only an owner manages billing (R6.3). Checked here, not just hidden in the
// UI, because these actions use the admin client and Stripe.
// Resolves to the owner, or to the reason there is none: "not the owner" and
// "could not tell who you are" (a failed identity check, say when Supabase is
// rate limiting) are different answers, and the second must not be worded as
// the first.
type Owner = { user: User; org: { name: string; slug: string } }

async function requireOwner(orgId: string): Promise<Owner | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error && error.status !== 401 && error.status !== 403)
    return { error: "Could not check who you are. Try again in a moment." }
  if (!user) return { error: NOT_OWNER }

  const { data: membership, error: membershipError } = await supabase
    .from("org_members")
    .select("role, orgs (name, slug)")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (membershipError) return { error: "Could not check your role. Try again in a moment." }
  if (membership?.role !== "owner" || !membership.orgs) return { error: NOT_OWNER }
  return { user, org: membership.orgs }
}

const NOT_OWNER = "Only an owner can manage billing."

async function origin() {
  const list = await headers()
  return list.get("origin") ?? `https://${list.get("host")}`
}

export async function startCheckout(orgId: string): Promise<BillingState> {
  if (!billingConfigured()) return { error: "Billing is not set up on this server." }
  const owner = await requireOwner(orgId)
  if ("error" in owner) return owner

  const admin = createAdminClient()
  const stripe = getStripe()

  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, status")
    .eq("org_id", orgId)
    .maybeSingle()
  if (existing && ["active", "trialing", "past_due"].includes(existing.status))
    return { error: "This org already has a subscription. Use Manage billing." }

  let customerId = existing?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: owner.user.email,
      name: owner.org.name,
      metadata: { org_id: orgId },
    })
    customerId = customer.id
    const { error } = await admin
      .from("subscriptions")
      .insert({ org_id: orgId, stripe_customer_id: customerId })
    if (error) return { error: error.message }
  }

  const { count } = await admin
    .from("org_members")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("role", "viewer")

  const base = `${await origin()}/${owner.org.slug}/settings/billing`
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: Math.max(1, count ?? 1) }],
    subscription_data: { metadata: { org_id: orgId } },
    allow_promotion_codes: true,
    success_url: `${base}?checkout=success`,
    cancel_url: base,
  })

  redirect(session.url!)
}

export async function openPortal(orgId: string): Promise<BillingState> {
  if (!billingConfigured()) return { error: "Billing is not set up on this server." }
  const owner = await requireOwner(orgId)
  if ("error" in owner) return owner

  const { data: row } = await createAdminClient()
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .maybeSingle()
  if (!row) return { error: "This org has no billing account yet." }

  const session = await getStripe().billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${await origin()}/${owner.org.slug}/settings/billing`,
  })

  redirect(session.url)
}
