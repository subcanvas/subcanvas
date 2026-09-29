import Link from "next/link"

import { AuthShell } from "@/components/auth-shell"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ROLE_LABELS, type Role } from "@/lib/roles"
import { createClient } from "@/lib/supabase/server"

import { AcceptButton } from "./accept-button"
import { SignOutButton } from "./sign-out-button"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const supabase = await createClient()

  const [{ data: invites }, { data: auth }] = await Promise.all([
    UUID.test(token)
      ? supabase.rpc("get_invite", { p_token: token })
      : Promise.resolve({ data: null }),
    supabase.auth.getUser(),
  ])
  const invite = invites?.[0]
  const user = auth.user
  const expired = invite && new Date(invite.expires_at) <= new Date()
  const here = `/invite/${token}`

  return (
    <AuthShell>
      <Card className="w-full">
        {!invite ? (
          <CardHeader>
            <CardTitle>This invite is no longer valid</CardTitle>
            <CardDescription>
              It may have been used already or revoked. Ask an admin of the workspace for a new one.
            </CardDescription>
          </CardHeader>
        ) : expired ? (
          <CardHeader>
            <CardTitle>This invite has expired</CardTitle>
            <CardDescription>
              It was for {invite.email} to join {invite.org_name}. Ask{" "}
              {invite.inviter ? `${invite.inviter} or another admin` : "an admin of the workspace"} to send it
              again.
            </CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Join {invite.org_name}</CardTitle>
              <CardDescription>
                {invite.email} was invited as {ROLE_LABELS[invite.role as Role].toLowerCase()}
                {invite.inviter && ` by ${invite.inviter}`}.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!user ? (
                <Link href={`/login?next=${encodeURIComponent(here)}`} className={buttonVariants()}>
                  Sign in to accept
                </Link>
              ) : user.email?.toLowerCase() !== invite.email ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    You are signed in as {user.email}. Sign out and sign in as {invite.email} to accept.
                  </p>
                  <SignOutButton next={here} />
                </>
              ) : (
                <AcceptButton token={token} />
              )}
            </CardContent>
          </>
        )}
      </Card>
    </AuthShell>
  )
}
