import { describe, expect, it } from "vitest"

import { originFromHeaders, requestOrigin } from "./origin"

const request = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers: new Headers(headers) })

describe("requestOrigin", () => {
  it("prefers the forwarded host, which is the one the person typed", () => {
    // What a proxy sends: the server listens on localhost, the site is not.
    expect(
      requestOrigin(
        request("http://localhost:3000/auth/callback", {
          host: "localhost:3000",
          "x-forwarded-host": "subcanvas.example",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe("https://subcanvas.example")
  })

  // The bug this helper exists for: a sign-in link that redirected to
  // localhost dropped the session it had just created.
  it("uses the Host header when nothing is forwarded", () => {
    expect(
      requestOrigin(request("http://127.0.0.1:3000/auth/callback", { host: "notes.example:8080" }))
    ).toBe("http://notes.example:8080")
  })

  it("keeps localhost on http, so development is not sent to https", () => {
    expect(requestOrigin(request("http://localhost:3310/auth/callback", { host: "localhost:3310" }))).toBe(
      "http://localhost:3310"
    )
  })

  it("assumes https for a name it has never seen unencrypted", () => {
    expect(originFromHeaders(new Headers({ host: "notes.example" }))).toBe("https://notes.example")
  })
})
