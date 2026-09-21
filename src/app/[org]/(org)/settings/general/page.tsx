import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { getOrgContext } from "@/lib/orgs"
import { hasRole, ROLE_LABELS, type Role } from "@/lib/roles"

import { SettingsSection } from "../settings-section"
import { DeleteOrg, LeaveOrg, RenameOrgForm } from "./general-forms"
import { StorageMeter } from "./storage-meter"

export const metadata = { title: "General" }

const ROLE_DETAILS: Record<Role, string> = {
  owner: "You can do everything, including billing and deleting the org.",
  admin: "You can manage members and projects, and create and edit content.",
  editor: "You can create and edit content.",
  viewer: "You can look at everything and change nothing.",
}

// One row of a danger zone: what the action does on the left, the button
// (or why there is none) on the right.
function DangerRow({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="max-w-md text-sm leading-relaxed text-graphite">{detail}</p>
      </div>
      {children}
    </div>
  )
}

// Every member sees this page, because everyone has a role to read and can
// leave. Only what the role allows can be changed, here and in the database.
export default async function GeneralPage({ params }: PageProps<"/[org]/settings/general">) {
  const { org: slug } = await params
  const { supabase, org, role, plan } = await getOrgContext(slug)
  const isAdmin = hasRole(role, "admin")
  const isOwner = role === "owner"

  const [{ data: details }, { count: owners }, { count: projects }, { data: subscription }, { data: media }] =
    await Promise.all([
      supabase.from("orgs").select("created_at").eq("id", org.id).single(),
      supabase.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", org.id).eq("role", "owner"),
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("org_id", org.id),
      supabase.from("subscriptions").select("cancel_at_period_end").eq("org_id", org.id).maybeSingle(),
      supabase.rpc("org_media_usage", { p_org_id: org.id }).maybeSingle(),
    ])
  // Shown only on a server that caps it; without a cap there is nothing to watch.
  const storage = media?.limit_bytes != null ? { used: media.used_bytes, limit: media.limit_bytes } : null

  const onlyOwner = isOwner && owners === 1
  // Mirrors the database trigger: a subscription that is still renewing
  // would keep charging a card for an org that no longer exists.
  const subscribed = Boolean(plan?.paid && !subscription?.cancel_at_period_end)

  return (
    <main id="main" className="flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow={org.name}
        title="General"
        description="What the org is called, where it lives, and what you can do in it."
      />

      <SettingsSection id="general-org" title="Org">
        <div className="flex flex-col gap-6">
          {isAdmin ? (
            <RenameOrgForm orgId={org.id} initial={org.name} />
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Name</p>
              <p className="text-sm">{org.name}</p>
              <p className="text-sm text-graphite">An admin or owner can change it.</p>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Address</p>
            <p className="font-mono text-sm">/{org.slug}</p>
            <p className="max-w-xl text-sm leading-relaxed text-graphite">
              The address is part of every link to this org: its projects, its documents, and diagrams embedded in
              other sites. Changing it would break them all, so it is fixed.
            </p>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-graphite">Created</dt>
            <dd>
              {details && new Date(details.created_at).toLocaleDateString("en-US", { dateStyle: "long" })}
            </dd>
          </dl>
        </div>
      </SettingsSection>

      {storage && (
        <SettingsSection
          id="general-storage"
          title="Storage"
          description="This server limits how much the org keeps in pictures and videos."
        >
          <StorageMeter used={storage.used} limit={storage.limit} />
        </SettingsSection>
      )}

      <SettingsSection id="general-role" title="Your role">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
          <p className="text-sm text-graphite">{ROLE_DETAILS[role]}</p>
        </div>
      </SettingsSection>

      <SettingsSection id="general-danger" title="Danger zone" danger>
        <div className="divide-y divide-rule">
          <DangerRow
            title="Leave this org"
            detail={
              onlyOwner
                ? "You are the only owner. Make someone else an owner in Members first, or delete the org."
                : "You lose access to its projects. Nothing you made is deleted."
            }
          >
            {!onlyOwner && <LeaveOrg slug={org.slug} orgId={org.id} orgName={org.name} />}
          </DangerRow>
          {isOwner && (
            <DangerRow
              title="Delete this org"
              detail={
                subscribed
                  ? "This org has a subscription. Cancel it in Billing first, so nobody keeps paying for an org that is gone."
                  : "Deletes every project, whiteboard, and document in it, for every member. It cannot be undone."
              }
            >
              {!subscribed && <DeleteOrg orgId={org.id} orgName={org.name} projects={projects ?? 0} />}
            </DangerRow>
          )}
        </div>
      </SettingsSection>
    </main>
  )
}
