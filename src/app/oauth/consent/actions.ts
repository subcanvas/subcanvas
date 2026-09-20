"use server"

import { redirect } from "next/navigation"

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
  const { data, error } =
    formData.get("decision") === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })

  if (error || !data) return { error: error?.message ?? "This request could not be answered. Start again from the app you are connecting." }
  redirect(data.redirect_url)
}
