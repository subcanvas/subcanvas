import { describe, expect, it } from "vitest"

import { MAX_BODY_BYTES, PER_MINUTE, receiveReport } from "./intake"

const ORIGIN = "https://subcanvas.example"
const report = { name: "TypeError", message: "x is undefined", stack: "at f (a.js:1:2)", route: "/[org]" }

// Each test its own address, so the per-minute limit of one does not reach
// another.
let address = 0
function post(body: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/errors`, {
    method: "POST",
    body,
    headers: { origin: ORIGIN, "x-forwarded-for": `203.0.113.${++address}`, ...headers },
  })
}

describe("receiveReport", () => {
  it("takes an error report from a page of this site", async () => {
    expect(await receiveReport(post(JSON.stringify(report)))).toEqual({ report: { source: "browser", ...report } })
  })

  it("takes one with no Origin when the browser says it is from this site", async () => {
    const request = new Request(`${ORIGIN}/api/errors`, {
      method: "POST",
      body: JSON.stringify(report),
      headers: { "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.200" },
    })
    expect(await receiveReport(request)).toHaveProperty("report")
  })

  it("refuses another site", async () => {
    expect(await receiveReport(post(JSON.stringify(report), { origin: "https://evil.example" }))).toMatchObject({ status: 403 })
    const anonymous = new Request(`${ORIGIN}/api/errors`, { method: "POST", body: JSON.stringify(report), headers: { "sec-fetch-site": "cross-site" } })
    expect(await receiveReport(anonymous)).toMatchObject({ status: 403 })
  })

  it("refuses a body over the cap, whether it says so or not", async () => {
    const big = JSON.stringify({ ...report, stack: "x".repeat(MAX_BODY_BYTES) })
    expect(await receiveReport(post(big))).toMatchObject({ status: 413 })
    expect(await receiveReport(post("{}", { "content-length": String(MAX_BODY_BYTES + 1) }))).toMatchObject({ status: 413 })
  })

  it("refuses what is not an error report", async () => {
    expect(await receiveReport(post("not json"))).toMatchObject({ status: 400 })
    expect(await receiveReport(post(JSON.stringify({ name: "Error" })))).toMatchObject({ status: 400 })
    expect(await receiveReport(post(JSON.stringify({ ...report, name: "x".repeat(201) })))).toMatchObject({ status: 400 })
  })

  it("takes a few a minute from one address, then refuses it and no other", async () => {
    const now = Date.UTC(2026, 9, 5, 12, 0, 0)
    const from = (ip: string) => post(JSON.stringify(report), { "x-forwarded-for": ip })
    for (let i = 0; i < PER_MINUTE; i++) expect(await receiveReport(from("198.51.100.1"), now)).toHaveProperty("report")
    expect(await receiveReport(from("198.51.100.1"), now)).toMatchObject({ status: 429 })
    expect(await receiveReport(from("198.51.100.2"), now)).toHaveProperty("report")
    // The next minute starts over.
    expect(await receiveReport(from("198.51.100.1"), now + 60_000)).toHaveProperty("report")
  })
})
