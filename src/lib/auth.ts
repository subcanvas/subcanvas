import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

// Only same-site paths are allowed as post-login destinations.
export function safeNext(next: string | null | undefined, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback
}

export async function requireUser(next: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`)

  return { supabase, user }
}
