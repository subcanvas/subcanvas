import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { PersonAvatar } from "@/components/person-avatar"
import { billingConfigured } from "@/lib/billing/stripe"
import { emailConfigured } from "@/lib/email"
import { getOrgContext } from "@/lib/orgs"
import { hasRole, ROLE_LABELS, type Role } from "@/lib/roles"
import { userColor } from "@/lib/user-color"

import { SettingsSection } from "../settings-section"
import { InviteForm } from "./invite-form"
import { InviteActions, MemberActions } from "./row-actions"

export const metadata = { title: "Members" }

export default async function MembersPage({
  params,
}: PageProps<"/[org]/settings/members">) {
  const { org: slug } = await params
  const { supabase, user, org, role: myRole } = await getOrgContext(slug)
  const isAdmin = hasRole(myRole, "admin")

  // Nobody else can be in a personal workspace, so there is nobody to list
  // and nobody to invite. The database refuses both anyway.
  if (org.personal)
    return (
      <main id="main" className="flex w-full max-w-3xl flex-col gap-8">
        <PageHeader eyebrow={org.name} title="Members" />
        <SettingsSection id="members-personal" title="Just you">
          <div className="flex flex-col items-start gap-4">
            <p className="max-w-xl text-sm leading-relaxed">
              This is your personal workspace, and it is yours alone: nobody else can join it or be invited to it.
              To work with other people, create a team workspace and invite them there.
            </p>
            <Link href={`/onboarding?from=${encodeURIComponent(org.slug)}`} className={buttonVariants()}>
              Create a team workspace
            </Link>
          </div>
        </SettingsSection>
      </main>
    )

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id, role, profiles (email, display_name, avatar_url)")
      .eq("org_id", org.id)
      .order("created_at"),
    isAdmin
      ? supabase
          .from("org_invites")
          .select("id, email, role, token, expires_at")
          .eq("org_id", org.id)
          .order("created_at")
      : Promise.resolve({ data: [] }),
  ])

  return (
    <main id="main" className="flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow={org.name}
        title="Members"
        description={
          billingConfigured()
            ? "Owners, admins, and editors can change things, and are the seats Pro is billed for. Viewers can only look, and are always free."
            : "Owners, admins, and editors can change things. Viewers can only look."
        }
      />

      <div className="overflow-hidden rounded-xl border border-rule bg-sheet">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead className="w-40">Role</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(members ?? []).map((member) => {
            const role = member.role as Role
            const isSelf = member.user_id === user.id
            // Mirrors the RLS policy: admins manage roles below owner,
            // owners manage everyone, nobody changes their own role.
            const canManage =
              !isSelf && isAdmin && (role !== "owner" || myRole === "owner")

            return (
              <TableRow key={member.user_id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <PersonAvatar
                      aria-hidden
                      name={member.profiles?.display_name ?? member.profiles?.email ?? ""}
                      picture={member.profiles?.avatar_url}
                      color={userColor(member.user_id)}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {member.profiles?.display_name ?? member.profiles?.email}
                        {isSelf && <span className="font-normal text-graphite"> (you)</span>}
                      </div>
                      {member.profiles?.display_name && (
                        <div className="truncate text-sm text-graphite">{member.profiles.email}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <MemberActions
                  slug={org.slug}
                  orgId={org.id}
                  userId={member.user_id}
                  role={role}
                  canManage={canManage}
                  canGrantOwner={myRole === "owner"}
                  canLeave={isSelf}
                />
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>

      {isAdmin && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Invite someone</h2>
            <p className="max-w-xl text-sm leading-relaxed text-graphite">
              {emailConfigured()
                ? "They get an email with a link to join. It works once, only for the email you enter, and for 7 days. Each invite also has the link to copy."
                : "Create an invite, then copy its link and send it to them yourself. It works once, only for the email you enter, and for 7 days."}
            </p>
          </div>

          <InviteForm slug={org.slug} orgId={org.id} />

          {invites && invites.length > 0 && (
            <Table>
              <TableBody>
                {invites.map((invite) => {
                  const expired = new Date(invite.expires_at) < new Date()
                  return (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell className="w-40">
                        <Badge variant="secondary">
                          {ROLE_LABELS[invite.role as Role]}
                        </Badge>
                        {expired && (
                          <Badge variant="outline" className="ml-2">
                            Expired
                          </Badge>
                        )}
                      </TableCell>
                      <InviteActions
                        slug={org.slug}
                        inviteId={invite.id}
                        token={invite.token}
                        expired={expired}
                      />
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </main>
  )
}
