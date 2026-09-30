import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Whether pages offer to connect an agent follows whether Supabase's OAuth
// server answers, and the answer is kept for a while.

const METADATA = "http://127.0.0.1:54321/auth/v1/.well-known/oauth-authorization-server"

async function fresh() {
  vi.resetModules()
  return (await import("./sign-in")).agentSignInAvailable
}

describe("agentSignInAvailable", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321/")
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("is true when Supabase Auth publishes its OAuth metadata", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetch)
    expect(await (await fresh())()).toBe(true)
    expect(fetch).toHaveBeenCalledWith(METADATA, expect.anything())
  })

  it("is false when the OAuth server is switched off", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"msg":"OAuth server is disabled"}', { status: 404 })))
    expect(await (await fresh())()).toBe(false)
  })

  it("asks again only after five minutes", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetch)
    const available = await fresh()
    await available()
    vi.advanceTimersByTime(4 * 60 * 1000)
    await available()
    expect(fetch).toHaveBeenCalledTimes(1)

    fetch.mockImplementation(async () => new Response("{}", { status: 404 }))
    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(await available()).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("keeps the last answer when Auth cannot be reached, and says no before there is one", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError("fetch failed")
    })
    vi.stubGlobal("fetch", fetch)
    const available = await fresh()
    expect(await available()).toBe(false)

    fetch.mockImplementation(async () => new Response("{}", { status: 200 }))
    expect(await available()).toBe(true)
    fetch.mockImplementation(async () => {
      throw new TypeError("fetch failed")
    })
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(await available()).toBe(true)
  })
})
