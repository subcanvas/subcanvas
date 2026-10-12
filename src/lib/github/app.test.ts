import { createVerify, generateKeyPairSync } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

import { appJwt, gitHubAppConfig, installationSettingsUrl, installUrl } from "./app"
import { decodeConnectState, encodeConnectState, newConnectState, sameState } from "./connect-state"
import { createGitHubProvider } from "./github-provider"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
})

describe("gitHubAppConfig", () => {
  const all = {
    APP_ID_GITHUB: "1",
    APP_CLIENT_ID_GITHUB: "Iv1.x",
    APP_SLUG_GITHUB: "subcanvas",
    APP_CLIENT_SECRET_GITHUB: "secret",
    APP_PRIVATE_KEY_GITHUB: privateKey,
  }

  it("needs all five", () => {
    for (const [name, value] of Object.entries(all)) vi.stubEnv(name, value)
    expect(gitHubAppConfig()).toMatchObject({ appId: "1", slug: "subcanvas" })
    vi.stubEnv("APP_CLIENT_SECRET_GITHUB", "")
    expect(gitHubAppConfig()).toBeNull()
  })

  it("takes a key pasted onto one line", () => {
    for (const [name, value] of Object.entries(all)) vi.stubEnv(name, value)
    vi.stubEnv("APP_PRIVATE_KEY_GITHUB", privateKey.replace(/\n/g, "\\n"))
    expect(gitHubAppConfig()?.privateKey).toBe(privateKey)
  })
})

describe("appJwt", () => {
  it("is signed with the private key, names the app, and lasts under ten minutes", () => {
    const now = Date.UTC(2026, 9, 12, 12)
    const token = appJwt({ appId: "5292860", privateKey }, now)
    const [header, payload, signature] = token.split(".")

    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" })
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString())
    expect(claims.iss).toBe("5292860")
    expect(claims.iat).toBe(now / 1000 - 60)
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600)
    expect(
      createVerify("RSA-SHA256").update(`${header}.${payload}`).verify(publicKey, Buffer.from(signature, "base64url"))
    ).toBe(true)
  })
})

describe("addresses on GitHub", () => {
  it("installs with the state handed back", () => {
    expect(installUrl({ slug: "subcanvas" }, "a b")).toBe("https://github.com/apps/subcanvas/installations/new?state=a%20b")
  })

  it("manages an organization's installation under the organization", () => {
    expect(installationSettingsUrl({ login: "acme", type: "Organization" }, 7)).toBe(
      "https://github.com/organizations/acme/settings/installations/7"
    )
    expect(installationSettingsUrl({ login: "ada", type: "User" }, 7)).toBe("https://github.com/settings/installations/7")
  })
})

describe("the connect state", () => {
  it("survives the cookie and matches only itself", () => {
    const state = newConnectState("org-id", "acme")
    expect(decodeConnectState(encodeConnectState(state))).toEqual(state)
    expect(sameState(state.state, state.state)).toBe(true)
    expect(sameState(state.state, `${state.state}x`)).toBe(false)
    expect(sameState(state.state, null)).toBe(false)
  })

  it("refuses a cookie that is not one", () => {
    expect(decodeConnectState(undefined)).toBeNull()
    expect(decodeConnectState("not base64 json")).toBeNull()
    expect(decodeConnectState(Buffer.from(JSON.stringify({ state: 1 })).toString("base64url"))).toBeNull()
  })
})

describe("createGitHubProvider with an installation", () => {
  const privateRepository = { private: true, default_branch: "main", description: null, full_name: "acme/vault" }
  const answer = (url: string, body: unknown) =>
    new Response(url.includes("/commits/") ? "b".repeat(40) : typeof body === "string" ? body : JSON.stringify(body), {
      status: 200,
    })

  it("reads a private repository with the installation's token, files through the API", async () => {
    const calls: { url: string; authorization: string | null; accept: string | null }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      calls.push({ url, authorization: headers.get("authorization"), accept: headers.get("accept") })
      return answer(url, url.includes("/contents/") ? "# Vault" : privateRepository)
    })

    const provider = createGitHubProvider({ clientId: "id", clientSecret: "secret" }, { installationToken: "ghs_x" })
    const described = await provider.describe({ owner: "acme", name: "vault" })
    expect(described.private).toBe(true)
    expect(await provider.readFile(described, "docs/README.md")).toBe("# Vault")

    expect(calls.every((call) => call.url.startsWith("https://api.github.com/"))).toBe(true)
    expect(calls.every((call) => call.authorization === "Bearer ghs_x")).toBe(true)
    const file = calls.find((call) => call.url.includes("/contents/"))
    expect(file?.url).toBe(`https://api.github.com/repos/acme/vault/contents/docs/README.md?ref=${"b".repeat(40)}`)
    expect(file?.accept).toBe("application/vnd.github.raw")
  })

  it("refuses a private repository without one, saying what to do", async () => {
    vi.stubGlobal("fetch", async (url: string) => answer(url, privateRepository))
    const provider = createGitHubProvider(undefined, { notFound: "Connect GitHub for that." })
    await expect(provider.describe({ owner: "acme", name: "vault" })).rejects.toMatchObject({
      kind: "not_found",
      message: "Connect GitHub for that.",
    })
  })
})
