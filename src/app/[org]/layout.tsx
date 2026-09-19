import { getOrgContext } from "@/lib/orgs"

export default async function OrgLayout({
  children,
  params,
}: LayoutProps<"/[org]">) {
  const { org: slug } = await params
  const { role, plan } = await getOrgContext(slug)

  return (
    <>
      {plan && (plan.locked || plan.grace_ends_at) && (
        <p role="status" className="border-b bg-destructive/10 px-4 py-2 text-sm">
          {plan.locked
            ? "This org is read-only: its subscription ended and it has more editors than the free plan includes."
            : `This org's subscription ended. It becomes read-only on ${new Date(plan.grace_ends_at).toLocaleDateString("en-US", { dateStyle: "long" })} unless it has ${plan.editor_limit} editors or fewer.`}{" "}
          {role === "owner"
            ? "Resubscribe in Billing, or change some editors to viewers in Members."
            : "An owner can fix this."}
        </p>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  )
}
