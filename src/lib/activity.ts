import "server-only"

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { after } from "next/server"

import { sendEmail } from "@/lib/email"
import { signUpEmail } from "@/lib/email-messages"
import { operatorContact } from "@/lib/legal"
import type { Database } from "@/lib/supabase/database.types"

// The step record: the first time each account reached a few key steps,
// kept in the database (migration account_steps) and read by the operator
// (docs/OPERATIONS.md). No script runs in the browser for it and no cookie is
// set. Steps that are a row being created are recorded by triggers; the ones
// here are what only the server sees. Only the step's name is sent, never
// anything the person wrote.
//
// Recording a step must never stand in the way of what the person is doing:
// a failure is logged and forgotten.

type Client = SupabaseClient<Database>

export type ServerStep =
  | "opened_github_import"
  | "imported_repository"
  | "imported_files"
  | "connected_agent"
  | "opened_billing"

export async function recordStep(supabase: Client, step: ServerStep) {
  try {
    const { error } = await supabase.rpc("record_step", { p_step: step })
    if (error) console.error(`Recording the step ${step} failed:`, error.message)
  } catch (error) {
    console.error(`Recording the step ${step} failed:`, error)
  }
}

// The accounts this server process has recorded a visit for, by UTC day: one
// call a day per account and process, however many pages they open.
const visits = new Set<string>()
const MAX_REMEMBERED = 10_000

// A signed-in person opened a workspace. The database records that they came
// back, when it is a later day than they signed up, and, in an account's
// first day, says whether the operator is still to be told about it. The
// email goes after the page has been sent, so it never slows it down.
export async function recordVisit(supabase: Client, user: User) {
  const key = `${user.id}:${new Date().toISOString().slice(0, 10)}`
  if (visits.has(key)) return
  if (visits.size >= MAX_REMEMBERED) visits.clear()
  visits.add(key)

  try {
    const { data: announce, error } = await supabase.rpc("record_visit")
    if (error) console.error("Recording a visit failed:", error.message)
    if (announce) after(() => announceSignUp(user))
  } catch (error) {
    console.error("Recording a visit failed:", error)
  }
}

async function announceSignUp(user: User) {
  const to = operatorContact()
  if (!to || !user.email) return
  const result = await sendEmail({
    to,
    ...signUpEmail({
      email: user.email,
      name: (user.user_metadata.full_name ?? user.user_metadata.name ?? null) as string | null,
      method: (user.app_metadata.provider as string | undefined) ?? "email",
      at: new Date(user.created_at),
    }),
  })
  if (result === "failed") console.error(`The email to ${to} about the new account ${user.id} did not go.`)
}
