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

  // Stripe's customer portal cancels by setting `cancel_at` to the end of
  // the period, leaving `cancel_at_period_end` false. Either way the
  // subscription will not renew, which is what the column means.
  const { error } = await supabase
    .from("subscriptions")
    .update({
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      seats: item?.quantity ?? 0,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || subscription.cancel_at != null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId)
  if (error) throw new Error(error.message)
}
