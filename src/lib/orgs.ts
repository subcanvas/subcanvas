import { notFound } from "next/navigation"
import { cache } from "react"

import { requireUser } from "@/lib/auth"
import { hasRole, type Role } from "@/lib/roles"

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

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single()
  if (!membership) notFound()

  const role = membership.role as Role
  const { data: usage } = await supabase.rpc("org_usage", { p_org_id: org.id })
  const plan = usage?.[0] ?? null
  // A lapsed org over its editor limit is read-only for everyone but owners.
  const canEdit = hasRole(role, "editor") && !(plan?.locked && role !== "owner")

  return { supabase, user, org, role, plan, canEdit }
})
