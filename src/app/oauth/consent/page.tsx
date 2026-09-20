import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/auth"

import { ConsentForm } from "./consent-form"

export const metadata: Metadata = { title: "Connect an app" }

// Where Supabase Auth, as the OAuth server, sends a person to approve an
// MCP client (docs/MCP.md). Supabase keeps the request; this page shows it
// and records the answer. The path is set in the project's OAuth server
// settings and in supabase/config.toml.
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const { authorization_id: authorizationId } = await searchParams
  if (typeof authorizationId !== "string") return <Invalid />

  const { supabase, user } = await requireUser(
    `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
  )
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) return <Invalid />
  // Already approved for this client: Supabase skips the question.
  if ("redirect_url" in data) redirect(data.redirect_url)

  // Anyone can register a client under any name, so the name alone proves
  // nothing. Where the code will be sent is what identifies the app.
  const destination = new URL(data.redirect_uri)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname)

  return (
    <AuthShell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Let {data.client.name} use Subcanvas as you?</CardTitle>
          <CardDescription>You are signed in as {user.email}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p>
            It will be able to read and change everything you can, in every org you belong to:
            projects, whiteboards, and documents. It cannot manage members or billing, and it never
            sees your password.
          </p>
          <p className="text-muted-foreground">
            {local
              ? "It is an app running on this computer."
              : `It will be connected through ${destination.host}.`}{" "}
            Only continue if you started this from an app you trust.
          </p>
          <ConsentForm authorizationId={authorizationId} clientName={data.client.name} />
        </CardContent>
      </Card>
    </AuthShell>
  )
}

function Invalid() {
  return (
    <AuthShell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>This request is no longer valid</CardTitle>
          <CardDescription>
            It may have expired or already been answered. Start again from the app you are
            connecting.
          </CardDescription>
        </CardHeader>
      </Card>
    </AuthShell>
  )
}
