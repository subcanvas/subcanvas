import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { recordStep } from "@/lib/activity"
import { billingConfigured } from "@/lib/billing/stripe"
import { getOrgContext } from "@/lib/orgs"
import { formatBytes } from "@/lib/whiteboard/media"

import { BillingButton } from "./billing-buttons"

// Pro is one price per workspace, however many people are in it (R7.2).
const PRICE_PER_MONTH = 5

const longDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { dateStyle: "long" })

export const metadata = { title: "Billing" }

export default async function BillingPage({
  params,
  searchParams,
}: PageProps<"/[org]/settings/billing">) {
  const { org: slug } = await params
  const justPaid = (await searchParams).checkout === "success"
  const { supabase, org, role, plan } = await getOrgContext(slug)

  const [{ data: subscription }, { data: media }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, current_period_end, cancel_at_period_end")
      .eq("org_id", org.id)
      .maybeSingle(),
    supabase.rpc("org_media_usage", { p_org_id: org.id }).maybeSingle(),
    recordStep(supabase, "opened_billing"),
  ])

  const paid = plan?.paid ?? false
  const isOwner = role === "owner"
  const configured = billingConfigured()
  // What the plan limits here. Pictures and videos are what Pro raises; a
  // server may also limit private documents and editors on the free plan.
  const storageLimit = media?.limit_bytes ?? null
  const documentLimit = paid ? null : (plan?.private_document_limit ?? null)
  const editorLimit = paid ? null : (plan?.editor_limit ?? null)
  const storage = storageLimit != null ? `${formatBytes(storageLimit)} of pictures and videos` : null

  return (
    <main id="main" className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader eyebrow={org.name} title="Billing" />

      {justPaid && !paid && (
        <p role="status" className="rounded-md border bg-muted/50 p-3 text-sm">
          Payment received. Your plan updates here in a few seconds; reload if it has not.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {paid ? "Pro plan" : "Free plan"}
            {subscription?.status === "past_due" && <Badge variant="destructive">Payment failed</Badge>}
            {paid && subscription?.cancel_at_period_end && <Badge variant="outline">Cancels soon</Badge>}
          </CardTitle>
          <CardDescription>
            {paid
              ? `$${PRICE_PER_MONTH} a month for this workspace${storage ? `, with ${storage}` : ""}.`
              : documentLimit == null && editorLimit == null
                ? `Editors, viewers and documents are unlimited.${storage ? ` The free plan includes ${storage}.` : ""}`
                : "Public projects and viewers are unlimited. Some of the rest is limited, as shown below."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            {media && storageLimit != null && (
              <>
                <dt className="text-muted-foreground">Pictures and videos</dt>
                <dd>
                  {formatBytes(media.used_bytes)} of {formatBytes(storageLimit)}
                </dd>
              </>
            )}
            {documentLimit != null && (
              <>
                <dt className="text-muted-foreground">Private documents</dt>
                <dd>
                  {plan?.private_documents ?? 0} of {documentLimit}
                </dd>
              </>
            )}
            {editorLimit != null && (
              <>
                <dt className="text-muted-foreground">Editors</dt>
                <dd>
                  {plan?.editors ?? 1} of {editorLimit} (owners, admins, and editors; viewers are free)
                </dd>
              </>
            )}
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
            <p className="text-muted-foreground">Pro is not set up on this server.</p>
          ) : !isOwner ? (
            <p className="text-muted-foreground">Only an owner can change the plan.</p>
          ) : paid || subscription?.status === "past_due" ? (
            <BillingButton orgId={org.id} kind="portal" label="Manage billing" />
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-muted-foreground">
                Pro is ${PRICE_PER_MONTH} a month for the whole workspace, with more room for pictures and videos.
              </p>
              <BillingButton orgId={org.id} kind="checkout" label={`Upgrade for $${PRICE_PER_MONTH} a month`} />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
