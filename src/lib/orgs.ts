import { notFound } from "next/navigation"
import { cache } from "react"

import { requireUser } from "@/lib/auth"
import { readOrgAccess } from "@/lib/org-access"

// Loads the workspace (an org, in the database) for a route, or 404s. RLS
// hides workspaces the user is not in, so "not a member" and "does not
// exist" look the same. `personal` is the signed-in person's own workspace,
// which nobody else can be in: nobody else can see one to open it.
export const getOrgContext = cache(async (slug: string) => {
  const { supabase, user } = await requireUser(`/${slug}`)

  const { data: row } = await supabase
    .from("orgs")
    .select("id, name, slug, personal_owner")
    .eq("slug", slug)
    .maybeSingle()
  if (!row) notFound()

  const access = await readOrgAccess(supabase, user.id, row.id)
  if (!access) notFound()

  const org = { id: row.id, name: row.name, slug: row.slug, personal: row.personal_owner !== null }
  return { supabase, user, org, ...access }
})
