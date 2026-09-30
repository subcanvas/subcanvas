import { NextResponse, type NextRequest } from "next/server"

import { requestOrigin } from "@/lib/origin"
import { createClient } from "@/lib/supabase/server"

// Sends a signed-in person to their personal workspace; anyone else to sign
// in. Every account has one from the moment it is created, so the fallbacks
// (their first workspace, then the page that makes one) are for an account
// the database somehow left without. See lib/home.ts.
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  const { data: orgs } = await supabase.from("orgs").select("slug, personal_owner").order("created_at")
  const home = orgs?.find((org) => org.personal_owner === user.id) ?? orgs?.[0]
  return NextResponse.redirect(`${origin}${home ? `/${home.slug}` : "/onboarding"}`)
}
