import { NextResponse, type NextRequest } from "next/server"
import type Stripe from "stripe"

import { billingConfigured, getStripe, recordSubscription } from "@/lib/billing/stripe"

// Stripe calls this whenever a subscription changes. The signature check is
// what makes the request trustworthy; there is no session here.
export async function POST(request: NextRequest) {
  if (!billingConfigured())
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 })

  const signature = request.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await recordSubscription(event.data.object)
        break
      case "checkout.session.completed": {
        // Usually redundant with subscription.created, but events can arrive
        // in any order, so read the subscription's current state.
        const session = event.data.object
        if (typeof session.subscription === "string")
          await recordSubscription(await getStripe().subscriptions.retrieve(session.subscription))
        break
      }
    }
  } catch (error) {
    console.error("Stripe webhook failed", event.type, error)
    // A 500 makes Stripe retry later.
    return NextResponse.json({ error: "Handler failed." }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
