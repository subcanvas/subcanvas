import type { SupabaseClient, User } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import { cache } from "react"

import { requireUser, signedOut } from "@/lib/auth"
import { readOrgAccess } from "@/lib/org-access"
import type { Database } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"

// Loads the workspace (an org, in the database) for a route, or 404s. RLS
// hides workspaces the user is not in, so "not a member" and "does not
// exist" look the same. `personal` is the signed-in person's own workspace,
// which nobody else can be in: nobody else can see one to open it.
export const getOrgContext = cache(async (slug: string) => {
  const { supabase, user } = await requireUser(`/${slug}`)
  const context = await loadOrg(supabase, user, slug)
  if (!context) notFound()
  return context
})

// The same, or null for someone signed out or outside the workspace, for
// the pages a visitor may open too: a public project's.
export const findOrgContext = cache(async (slug: string) => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (!user) {
    // Auth being down is not the same as being signed out.
    if (!signedOut(error)) throw error
    return null
  }
  return loadOrg(supabase, user, slug)
})

async function loadOrg(supabase: SupabaseClient<Database>, user: User, slug: string) {
  const { data: row } = await supabase
    .from("orgs")
    .select("id, name, slug, personal_owner")
    .eq("slug", slug)
    .maybeSingle()
  if (!row) return null

  const access = await readOrgAccess(supabase, user.id, row.id)
  if (!access) return null

  const org = { id: row.id, name: row.name, slug: row.slug, personal: row.personal_owner !== null }
  return { supabase, user, org, ...access }
}
