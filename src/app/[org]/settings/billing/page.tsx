import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { billingConfigured } from "@/lib/billing/stripe"
import { getOrgContext } from "@/lib/orgs"

import { BillingButton } from "./billing-buttons"

const PRICE_PER_SEAT = 5

const longDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { dateStyle: "long" })

export default async function BillingPage({
  params,
  searchParams,
}: PageProps<"/[org]/settings/billing">) {
  const { org: slug } = await params
  const justPaid = (await searchParams).checkout === "success"
  const { supabase, org, role, plan } = await getOrgContext(slug)

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end")
    .eq("org_id", org.id)
    .maybeSingle()

  const paid = plan?.paid ?? false
  const isOwner = role === "owner"
  const configured = billingConfigured()
  const editors = plan?.editors ?? 1
  const hasLimits = plan?.private_document_limit != null || plan?.editor_limit != null

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <PageHeader eyebrow={org.name} title="Billing" />

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
              ? `$${PRICE_PER_SEAT} per editor each month. Unlimited private documents and editors.`
              : hasLimits
                ? "Public projects are unlimited. Private documents and editors are limited. Viewers are always free."
                : "This server has no plan limits."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            <dt className="text-muted-foreground">Private documents</dt>
            <dd>
              {plan?.private_documents ?? 0}
              {!paid && plan?.private_document_limit != null && ` of ${plan.private_document_limit}`}
            </dd>
            <dt className="text-muted-foreground">Editors</dt>
            <dd>
              {editors}
              {!paid && plan?.editor_limit != null && ` of ${plan.editor_limit}`} (owners, admins, and
              editors; viewers are free)
            </dd>
            {paid && subscription?.current_period_end && (
              <>
                <dt className="text-muted-foreground">
                  {subscription.cancel_at_period_end ? "Ends" : "Renews"}
                </dt>
                <dd>{longDate(subscription.current_period_end)}</dd>
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
              label={`Upgrade for $${PRICE_PER_SEAT * editors} a month`}
            />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
