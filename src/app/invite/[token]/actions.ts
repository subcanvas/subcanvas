"use server"

import { redirect } from "next/navigation"

import { syncSeats } from "@/lib/billing/stripe"
import { createClient } from "@/lib/supabase/server"

export type AcceptState = { error: string } | null

export async function acceptInvite(token: string): Promise<AcceptState> {
  const supabase = await createClient()
  const { data: org, error } = await supabase.rpc("accept_invite", {
    p_token: token,
  })

  if (error) return { error: error.message }

  await syncSeats(org.id)
  redirect(`/${org.slug}`)
}
