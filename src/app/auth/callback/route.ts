import { NextResponse, type NextRequest } from "next/server"

import { safeNext } from "@/lib/auth"
import { requestOrigin } from "@/lib/origin"
import { createClient } from "@/lib/supabase/server"

// Landing point for magic links and OAuth. Swaps the code for a session.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  // Not request.nextUrl.origin: `next start` reports the address it listens
  // on, so a self-hosted server behind a proxy would redirect to localhost
  // and drop the session it just created.
  const origin = requestOrigin(request)
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=link`)
}
