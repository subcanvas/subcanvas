import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { getOrgContext } from "@/lib/orgs"
import { hasRole, ROLE_LABELS, type Role } from "@/lib/roles"
import { userColor } from "@/lib/user-color"

import { InviteForm } from "./invite-form"
import { InviteActions, MemberActions } from "./row-actions"

export const metadata = { title: "Members" }

export default async function MembersPage({
  params,
}: PageProps<"/[org]/settings/members">) {
  const { org: slug } = await params
  const { supabase, user, org, role: myRole } = await getOrgContext(slug)
  const isAdmin = hasRole(myRole, "admin")

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id, role, profiles (email, display_name)")
      .eq("org_id", org.id)
      .order("created_at"),
    isAdmin
      ? supabase
          .from("org_invites")
          .select("id, email, role, token, expires_at")
          .eq("org_id", org.id)
          .is("accepted_at", null)
          .order("created_at")
      : Promise.resolve({ data: [] }),
  ])

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <PageHeader
        eyebrow={org.name}
        title="Members"
        description="Owners, admins, and editors can change things, and are the seats a paid plan is billed for. Viewers can only look, and are always free."
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
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
                      style={{ backgroundColor: userColor(member.user_id) }}
                    >
                      {(member.profiles?.display_name ?? member.profiles?.email ?? "?").charAt(0).toUpperCase()}
                    </span>
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
              Create an invite, then send them the link yourself. It works once, only for the email you
              enter, and for 7 days.
            </p>
          </div>

          <InviteForm slug={org.slug} orgId={org.id} />

          {invites && invites.length > 0 && (
            <Table>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell className="w-40">
                      <Badge variant="secondary">
                        {ROLE_LABELS[invite.role as Role]}
                      </Badge>
                      {new Date(invite.expires_at) < new Date() && (
                        <Badge variant="outline" className="ml-2">
                          Expired
                        </Badge>
                      )}
                    </TableCell>
                    <InviteActions
                      slug={org.slug}
                      inviteId={invite.id}
                      token={invite.token}
                    />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </main>
  )
}
