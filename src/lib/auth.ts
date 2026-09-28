import { isAuthApiError, isAuthSessionMissingError, type AuthError } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

// Only same-site paths are allowed as post-login destinations.
export function safeNext(next: string | null | undefined, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback
}

// Whether a failed check means there is no one signed in. No session, or an
// answer from Auth that the token is not good, is signed out. Auth being
// slow or down is not: a signed-in person sent to the sign-in page then
// thinks they were logged out.
export function signedOut(error: AuthError | null) {
  return !error || isAuthSessionMissingError(error) || (isAuthApiError(error) && error.status < 500)
}

export async function requireUser(next: string) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (!user) {
    // Thrown, the error page offers to try again.
    if (!signedOut(error)) throw error
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  return { supabase, user }
}
