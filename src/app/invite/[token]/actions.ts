"use server"

import { redirect } from "next/navigation"

import { ASK_AN_OWNER, limitMessage } from "@/lib/billing/limit"
import { billingConfigured, syncSeats } from "@/lib/billing/stripe"
import { createClient } from "@/lib/supabase/server"

export type AcceptState = { error: string } | null

export async function acceptInvite(token: string): Promise<AcceptState> {
  const supabase = await createClient()
  const { data: org, error } = await supabase.rpc("accept_invite", {
    p_token: token,
  })

  if (error) {
    const limit = limitMessage(error.code, error.message)
    if (!limit) return { error: error.message }
    // Whoever accepts is not a member yet, so not an owner either.
    return { error: billingConfigured() ? `${limit} ${ASK_AN_OWNER}` : limit }
  }

  await syncSeats(org.id)
  redirect(`/${org.slug}`)
}
