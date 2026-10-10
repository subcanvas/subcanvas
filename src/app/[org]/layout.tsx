import { PlanProvider } from "@/components/limit-refusal"
import { recordVisit } from "@/lib/activity"
import { upgradeFor } from "@/lib/billing/limit"
import { billingConfigured } from "@/lib/billing/stripe"
import { findOrgContext } from "@/lib/orgs"

export default async function OrgLayout({
  children,
  params,
}: LayoutProps<"/[org]">) {
  const { org: slug } = await params
  // A visitor to one of the workspace's public projects is not a member: the
  // project's own layout decides what they see (lib/project-access.ts), and
  // the workspace's own pages send them away ((org)/layout.tsx).
  const member = await findOrgContext(slug)
  if (!member) return <div className="flex flex-1 flex-col">{children}</div>
  const { supabase, user, role, plan } = member
  // For the step record: coming back on a later day, and the operator's
  // email about a new account (lib/activity.ts).
  await recordVisit(supabase, user)

  return (
    <>
      {plan && (plan.locked || plan.grace_ends_at) && (
        <p role="status" className="border-b bg-destructive/10 px-4 py-2 text-sm">
          {plan.locked
            ? "This workspace is read-only: its subscription ended and it has more editors than the free plan includes."
            : `This workspace's subscription ended. It becomes read-only on ${new Date(plan.grace_ends_at).toLocaleDateString("en-US", { dateStyle: "long" })} unless it has ${plan.editor_limit === 1 ? "only one editor" : `${plan.editor_limit} editors or fewer`}.`}{" "}
          {role === "owner"
            ? "Resubscribe in Billing, or change some editors to viewers in Members."
            : "An owner can fix this."}
        </p>
      )}
      {/* What every page here offers when an action meets a plan limit. */}
      <PlanProvider upgrade={upgradeFor(role, billingConfigured())} billingHref={`/${slug}/settings/billing`}>
        <div className="flex flex-1 flex-col">{children}</div>
      </PlanProvider>
    </>
  )
}
