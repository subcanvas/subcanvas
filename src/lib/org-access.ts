import type { SupabaseClient } from "@supabase/supabase-js"

import { hasRole, type Role } from "@/lib/roles"
import type { Database } from "@/lib/supabase/database.types"

// A person's standing in one org: their role, the org's plan, and whether
// they can change anything. The web app and the MCP server both ask here, so
// they cannot disagree. Returns null for someone who is not a member.
export async function readOrgAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string
) {
  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .single()
  if (!membership) return null

  const role = membership.role as Role
  const { data: usage } = await supabase.rpc("org_usage", { p_org_id: orgId })
  const plan = usage?.[0] ?? null
  // A lapsed org over its editor limit is read-only for everyone but owners.
  const canEdit = hasRole(role, "editor") && !(plan?.locked && role !== "owner")

  return { role, plan, canEdit }
}
