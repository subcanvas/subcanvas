import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Error reports (api/errors) need no session, and a page that fails
    // should not cost a sign-in check per report. Nor does the playground's
    // example (api/playground), which is the same for everyone.
    "/((?!_next/static|_next/image|favicon.ico|api/errors|api/playground|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
