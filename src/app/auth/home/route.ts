import { NextResponse, type NextRequest } from "next/server"

import { requestOrigin } from "@/lib/origin"
import { createClient } from "@/lib/supabase/server"

// Sends a signed-in person to the workspace they joined first (for most, the
// one made when they signed up); anyone else to sign in. Someone who has left
// or deleted every workspace they were in is asked to make one. See
// lib/home.ts.
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  const { data: first } = await supabase
    .from("org_members")
    .select("orgs(slug)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle()
  const slug = first?.orgs?.slug
  return NextResponse.redirect(`${origin}${slug ? `/${slug}` : "/onboarding"}`)
}
