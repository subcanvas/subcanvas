import "server-only"

import Stripe from "stripe"

import { createAdminClient } from "@/lib/supabase/admin"

// Billing is optional. A deployment without these variables has no paid
// plan, and its operator lifts the document limit in the database instead
// (see the README).
export function billingConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_ID &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.SUPABASE_SECRET_KEY
  )
}

let client: Stripe | null = null
export function getStripe() {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!)
  return client
}

// Writes what Stripe says about a subscription into our table. Stripe is
// the source of truth; this is called from the webhook for every change.
export async function recordSubscription(subscription: Stripe.Subscription) {
  const supabase = createAdminClient()
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
  const item = subscription.items.data[0]
  // Newer API versions report the period on the item, older ones on the subscription.
  const periodEnd =
    item?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end

  const { error } = await supabase
    .from("subscriptions")
    .update({
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      seats: item?.quantity ?? 0,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId)
  if (error) throw new Error(error.message)
}

// Matches the Stripe quantity to the org's billed seats (R7.4). Called after
// any membership change. Failures are logged, not thrown: a Stripe outage
// must not stop an admin from managing members.
export async function syncSeats(orgId: string) {
  if (!billingConfigured()) return
  try {
    const supabase = createAdminClient()
    const { data: row } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, status, seats")
      .eq("org_id", orgId)
      .maybeSingle()
    if (!row?.stripe_subscription_id || !["active", "trialing", "past_due"].includes(row.status))
      return

    const { count } = await supabase
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .neq("role", "viewer")
    const seats = Math.max(1, count ?? 1)
    if (seats === row.seats) return

    const stripe = getStripe()
    const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
    await stripe.subscriptions.update(subscription.id, {
      items: [{ id: subscription.items.data[0].id, quantity: seats }],
      proration_behavior: "create_prorations",
    })
    // The webhook records the new quantity.
  } catch (error) {
    console.error("Seat sync failed for org", orgId, error)
  }
}
