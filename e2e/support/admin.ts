import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// The local stack as its operator sees it, through the secret key, for the
// few things a browser cannot show: whether a file is still in Storage once
// the account it belonged to is gone, or a subscription Stripe would have
// written. The local stack's keys are the same on every machine and grant
// nothing anywhere else.
//
// The key comes from the environment, else from .env.local (where
// `next start` reads it), else from `supabase status`, which is how CI
// finds it too. With none of them, `adminClient` is null and a spec that
// needs it skips.

const ROOT = path.resolve(__dirname, "../..")

function dotEnvLocal(): Record<string, string> {
  let text: string
  try {
    text = readFileSync(path.join(ROOT, ".env.local"), "utf8")
  } catch {
    return {}
  }
  const values: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2")
  }
  return values
}

function stackStatus(): Record<string, string> {
  try {
    const text = execSync("supabase status -o env", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    return Object.fromEntries([...text.matchAll(/^([A-Z0-9_]+)="(.*)"$/gm)].map((match) => [match[1], match[2]]))
  } catch {
    return {}
  }
}

type Stack = { url?: string; publishableKey?: string; secretKey?: string }
let stack: Stack | undefined

function settings(): Stack {
  if (stack) return stack
  const file = dotEnvLocal()
  stack = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || file.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || file.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY || file.SUPABASE_SECRET_KEY,
  }
  if (!stack.url || !stack.publishableKey || !stack.secretKey) {
    const status = stackStatus()
    stack.url ||= status.API_URL
    stack.publishableKey ||= status.PUBLISHABLE_KEY
    stack.secretKey ||= status.SECRET_KEY
  }
  return stack
}

const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } }

// The operator's client. The secret key reads Storage and writes
// subscriptions; like the app's own server, it has no grant on the other
// tables.
export function adminClient(): SupabaseClient | null {
  const { url, secretKey } = settings()
  return url && secretKey ? createClient(url, secretKey, OPTIONS) : null
}

export const NO_ADMIN = "Needs the local stack's secret key (SUPABASE_SECRET_KEY, .env.local, or `supabase status`)"

// A workspace's id, asked as someone in it, who signs in with a password.
export async function workspaceId(account: { email: string; password: string }, slug: string): Promise<string> {
  const { url, publishableKey } = settings()
  if (!url || !publishableKey) throw new Error("No Supabase URL or publishable key")
  const supabase = createClient(url, publishableKey, OPTIONS)
  const { error: signInError } = await supabase.auth.signInWithPassword(account)
  if (signInError) throw signInError
  const { data, error } = await supabase.from("orgs").select("id").eq("slug", slug).single()
  if (error) throw error
  return data.id
}

// The ids behind a readable address (/<workspace>/<project>[/<title>-<code>],
// src/lib/navigation.ts), found the way the app finds them: as anyone, for a
// public project, or as `account`, who signs in with a password.
export async function idsOf(
  address: string,
  account?: { email: string; password: string }
): Promise<{ projectId: string; documentId: string | null }> {
  const { url, publishableKey } = settings()
  if (!url || !publishableKey) throw new Error("No Supabase URL or publishable key")
  const supabase = createClient(url, publishableKey, OPTIONS)
  if (account) {
    const { error } = await supabase.auth.signInWithPassword(account)
    if (error) throw error
  }
  const [workspace, project, document] = new URL(address, "http://local").pathname.split("/").slice(1)
  const { data: found, error } = await supabase
    .rpc("find_project", { p_workspace: workspace, p_project: project })
    .single<{ project_id: string }>()
  if (error) throw error
  if (!document) return { projectId: found.project_id, documentId: null }
  const code = document.slice(document.lastIndexOf("-") + 1)
  const { data: row, error: documentError } = await supabase
    .from("documents")
    .select("id")
    .eq("project_id", found.project_id)
    .eq("code", code)
    .single()
  if (documentError) throw documentError
  return { projectId: found.project_id, documentId: row.id }
}
