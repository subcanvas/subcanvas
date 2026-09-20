import { notFound } from "next/navigation"
import { cache } from "react"

import { requireUser } from "@/lib/auth"
import { readOrgAccess } from "@/lib/org-access"

// Loads the org for a route, or 404s. RLS hides orgs the user is not in,
// so "not a member" and "does not exist" look the same.
export const getOrgContext = cache(async (slug: string) => {
  const { supabase, user } = await requireUser(`/${slug}`)

  const { data: org } = await supabase
    .from("orgs")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle()
  if (!org) notFound()

  const access = await readOrgAccess(supabase, user.id, org.id)
  if (!access) notFound()

  return { supabase, user, org, ...access }
})
