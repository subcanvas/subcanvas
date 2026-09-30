import { isAuthApiError, isAuthSessionMissingError, type AuthError } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { WORKSPACE_HOME } from "@/lib/home"
import { createClient } from "@/lib/supabase/server"

// Only same-site paths are allowed as post-login destinations. What counts
// is what a browser makes of the address, not how it looks: a browser reads
// a backslash as a slash and drops tabs and newlines, so "/\evil.com" is
// "//evil.com", another site. The path is returned as the browser reads it.
const PROBE = "http://next.invalid"

export function safeNext(next: string | null | undefined, fallback = WORKSPACE_HOME) {
  if (!next?.startsWith("/")) return fallback
  let url: URL
  let decoded: string
  try {
    url = new URL(next, PROBE)
    decoded = decodeURIComponent(url.pathname)
  } catch {
    return fallback
  }
  // "/.//evil.com" stays on this site while it is parsed, and becomes
  // "//evil.com" once it is sent back as a path. An encoded slash or
  // backslash there is refused too, in case something on the way decodes it.
  if (url.origin !== PROBE || /^\/[/\\]/.test(decoded)) return fallback
  return `${url.pathname}${url.search}${url.hash}`
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
