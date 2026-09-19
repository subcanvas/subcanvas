import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { billingConfigured } from "@/lib/billing/stripe"
import { getOrgContext } from "@/lib/orgs"

import { BillingButton } from "./billing-buttons"

const PRICE_PER_SEAT = 5

export default async function BillingPage({
  params,
  searchParams,
}: PageProps<"/[org]/settings/billing">) {
  const { org: slug } = await params
  const justPaid = (await searchParams).checkout === "success"
  const { supabase, org, role } = await getOrgContext(slug)

  const [{ data: usageRows }, { data: subscription }] = await Promise.all([
    supabase.rpc("org_usage", { p_org_id: org.id }),
    supabase
      .from("subscriptions")
      .select("status, seats, current_period_end, cancel_at_period_end")
      .eq("org_id", org.id)
      .maybeSingle(),
  ])
  const usage = usageRows?.[0]
  const paid = usage?.paid ?? false
  const isOwner = role === "owner"
  const configured = billingConfigured()
  const seats = usage?.billed_seats ?? 1
  const renews =
    subscription?.current_period_end &&
    new Date(subscription.current_period_end).toLocaleDateString("en-US", { dateStyle: "long" })

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>

      {justPaid && !paid && (
        <p role="status" className="rounded-md border bg-muted/50 p-3 text-sm">
          Payment received. Your plan updates here in a few seconds; reload if it has not.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {paid ? "Team plan" : "Free plan"}
            {subscription?.status === "past_due" && <Badge variant="destructive">Payment failed</Badge>}
            {paid && subscription?.cancel_at_period_end && <Badge variant="outline">Cancels soon</Badge>}
          </CardTitle>
          <CardDescription>
            {paid
              ? `$${PRICE_PER_SEAT} per seat each month. Unlimited documents.`
              : usage?.document_limit == null
                ? "This server has no document limit."
                : `Up to ${usage.document_limit} documents. Unlimited members and viewers.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            <dt className="text-muted-foreground">Documents</dt>
            <dd>
              {usage?.documents ?? 0}
              {!paid && usage?.document_limit != null && ` of ${usage.document_limit}`}
            </dd>
            <dt className="text-muted-foreground">Billed seats</dt>
            <dd>
              {seats} (owners, admins, and editors; viewers are free)
            </dd>
            {paid && renews && (
              <>
                <dt className="text-muted-foreground">
                  {subscription?.cancel_at_period_end ? "Ends" : "Renews"}
                </dt>
                <dd>{renews}</dd>
              </>
            )}
          </dl>

          {!configured ? (
            <p className="text-muted-foreground">Paid plans are not set up on this server.</p>
          ) : !isOwner ? (
            <p className="text-muted-foreground">Only an owner can change the plan.</p>
          ) : paid || subscription?.status === "past_due" ? (
            <BillingButton orgId={org.id} kind="portal" label="Manage billing" />
          ) : (
            <BillingButton
              orgId={org.id}
              kind="checkout"
              label={`Upgrade for $${PRICE_PER_SEAT * seats} a month`}
            />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
