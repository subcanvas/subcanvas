import { NextResponse, type NextRequest } from "next/server"

import { requestOrigin } from "@/lib/origin"
import { createClient } from "@/lib/supabase/server"

// Sends a signed-in person to their first org, or to onboarding if they have
// none yet; anyone else to sign in. See lib/home.ts.
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  const { data: orgs } = await supabase.from("orgs").select("slug").order("created_at").limit(1)
  return NextResponse.redirect(`${origin}${orgs?.[0] ? `/${orgs[0].slug}` : "/onboarding"}`)
}
