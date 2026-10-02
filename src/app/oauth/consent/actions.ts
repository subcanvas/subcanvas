"use server"

import { redirect } from "next/navigation"

import { recordStep } from "@/lib/activity"
import { createClient } from "@/lib/supabase/server"

export type ConsentState = { error: string } | null

// Records the person's answer with Supabase Auth, which replies with where
// to send them: back to the MCP client, carrying an authorization code or
// the refusal.
export async function decideAuthorization(
  authorizationId: string,
  _prev: ConsentState,
  formData: FormData
): Promise<ConsentState> {
  const supabase = await createClient()
  const approve = formData.get("decision") === "approve"
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })

  if (error || !data) return { error: error?.message ?? "This request could not be answered. Start again from the app you are connecting." }
  if (approve) await recordStep(supabase, "connected_agent")
  redirect(data.redirect_url)
}

// For someone signed in as another account than the one they meant. Supabase
// ties a request to the first account that opens it, so it cannot be handed
// to another: this one is refused as that account, which is then signed out,
// and the app that asked is told no. Connecting again from the app starts a
// new request, which asks who is signing in.
export async function signOutInstead(authorizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
  await supabase.auth.signOut()
  redirect(data?.redirect_url ?? "/login")
}
