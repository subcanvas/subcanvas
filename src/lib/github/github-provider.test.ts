import { afterEach, describe, expect, it, vi } from "vitest"

import { createGitHubProvider, gitHubAppCredentials } from "./github-provider"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("gitHubAppCredentials", () => {
  it("needs both the id and the secret", () => {
    vi.stubEnv("OAUTH_CLIENT_ID_GITHUB", "id")
    vi.stubEnv("OAUTH_CLIENT_SECRET_GITHUB", "")
    expect(gitHubAppCredentials()).toBeUndefined()

    vi.stubEnv("OAUTH_CLIENT_SECRET_GITHUB", "secret")
    expect(gitHubAppCredentials()).toEqual({ clientId: "id", clientSecret: "secret" })
  })
})

describe("createGitHubProvider", () => {
  const repository = { id: 1, private: false, default_branch: "main", description: null, full_name: "o/r" }
  // The commit endpoint is asked for the bare id; everything else is JSON.
  const answer = (url: string) =>
    new Response(url.includes("/commits/") ? "a".repeat(40) : JSON.stringify(repository), { status: 200 })

  it("asks the API as the OAuth app, and sends the secret nowhere else", async () => {
    const calls: { url: string; authorization: string | null }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, authorization: new Headers(init.headers).get("authorization") })
      return answer(url)
    })

    const provider = createGitHubProvider({ clientId: "id", clientSecret: "secret" })
    const described = await provider.describe({ owner: "o", name: "r" })
    await provider.readFile(described, "README.md")

    const api = calls.filter((call) => call.url.startsWith("https://api.github.com/"))
    const raw = calls.filter((call) => call.url.startsWith("https://raw.githubusercontent.com/"))
    expect(api.length).toBeGreaterThan(0)
    expect(api.every((call) => call.authorization === `Basic ${btoa("id:secret")}`)).toBe(true)
    expect(raw.length).toBe(1)
    expect(raw[0].authorization).toBeNull()
  })

  it("asks anonymously when there are no credentials", async () => {
    const seen: (string | null)[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get("authorization"))
      return answer(url)
    })
    await createGitHubProvider(undefined).describe({ owner: "o", name: "r" })
    expect(seen.every((value) => value === null)).toBe(true)
  })
})
