import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { safeNext, signedOut } from "./auth"

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

// Where sign-in sends someone afterwards comes from the address, so anyone
// can write it into a link. It has to stay on this site.
describe("safeNext", () => {
  const HOME = "/auth/home"

  it("keeps a path on this site, query and fragment included", () => {
    expect(safeNext("/acme")).toBe("/acme")
    expect(safeNext("/invite/0f6a")).toBe("/invite/0f6a")
    expect(safeNext("/acme/p1/d/d1?via=a.b#top")).toBe("/acme/p1/d/d1?via=a.b#top")
    expect(safeNext("/auth/password?next=%2Facme%2Fsettings%2Fprofile")).toBe(
      "/auth/password?next=%2Facme%2Fsettings%2Fprofile"
    )
    expect(safeNext("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc")
  })

  it("falls back when there is nothing, or something that is not a path", () => {
    expect(safeNext(null)).toBe(HOME)
    expect(safeNext(undefined)).toBe(HOME)
    expect(safeNext("")).toBe(HOME)
    expect(safeNext("acme")).toBe(HOME)
    expect(safeNext("https://evil.com")).toBe(HOME)
    expect(safeNext("javascript:alert(1)")).toBe(HOME)
    expect(safeNext(" /acme")).toBe(HOME)
    expect(safeNext(null, "/elsewhere")).toBe("/elsewhere")
  })

  it("refuses every shape a browser reads as another site", () => {
    for (const next of [
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/.//evil.com",
      "/a/..//evil.com",
      "/a/../\\evil.com",
      "/%5Cevil.com",
      "/%5cevil.com",
      "/%2F%2Fevil.com",
      "/%2fevil.com",
    ])
      expect(safeNext(next), JSON.stringify(next)).toBe(HOME)
  })

  it("refuses an address that does not decode", () => {
    expect(safeNext("/%E0%A4%A")).toBe(HOME)
  })
})
