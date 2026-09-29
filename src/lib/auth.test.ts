import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { signedOut } from "./auth"

// A page that needs someone signed in sends them to sign in only when Auth
// says there is no one. When Auth cannot be reached, it shows the error page
// instead, and the person, still signed in, tries again.
describe("signedOut", () => {
  it("is true when there is no session, or Auth rejects the token", () => {
    expect(signedOut(null)).toBe(true)
    expect(signedOut(new AuthSessionMissingError())).toBe(true)
    expect(signedOut(new AuthApiError("invalid JWT", 403, "bad_jwt"))).toBe(true)
    expect(signedOut(new AuthApiError("user not found", 401, "user_not_found"))).toBe(true)
  })

  it("is false when Auth is slow, down, or answers with an error of its own", () => {
    expect(signedOut(new AuthRetryableFetchError("fetch failed", 0))).toBe(false)
    expect(signedOut(new AuthApiError("internal error", 500, "unexpected_failure"))).toBe(false)
    expect(signedOut(new AuthUnknownError("bad gateway", new Error("502")))).toBe(false)
  })
})
