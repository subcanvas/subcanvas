import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"

import { expect, type Page } from "@playwright/test"
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
} from "@modelcontextprotocol/client"

import { cardTitled } from "./app"

// An MCP client, as Claude Code or Cursor would be one, driven from inside
// a test: it discovers where to sign in, registers itself, sends the
// browser to the consent page, and comes back with a token. The browser is
// the test's `page`, signed in as whoever the spec made.

export const MCP_PATH = "/mcp"
export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource"

// The tools docs/MCP.md promises, read from the table there, so a tool
// added or renamed without its documentation fails the suite.
export function documentedTools(): string[] {
  const docs = readFileSync(join(__dirname, "../../docs/MCP.md"), "utf8")
  return [...docs.matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1])
}

// Whether the authorization server the app names is answering. The local
// stack only serves OAuth when [auth.oauth_server] was on when it started;
// a stack started before that setting says "OAuth server is disabled" and
// the sign-in cannot be tried until it is restarted.
export async function oauthServerEnabled(baseURL: string): Promise<boolean> {
  const resource = await (await fetch(`${baseURL}${RESOURCE_METADATA_PATH}`)).json()
  const [issuer] = resource.authorization_servers as string[]
  const metadata = await fetch(`${issuer}/.well-known/oauth-authorization-server`)
  return metadata.ok
}

export const OAUTH_SERVER_OFF =
  "The local Supabase stack has its OAuth server off: restart it (`supabase stop && supabase start` in the app repo) so [auth.oauth_server] in supabase/config.toml applies."

// Where the authorization server sends the browser back with the code: a
// loopback listener like the one a desktop MCP client opens (RFC 8252). It
// records the query it was called with and answers with a page.
async function listenForCallback() {
  let resolve!: (params: URLSearchParams) => void
  const received = new Promise<URLSearchParams>((r) => (resolve = r))
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8")
    response.end("<!doctype html><title>Connected</title><p>You can go back to the app.</p>")
    resolve(new URL(request.url ?? "/", "http://127.0.0.1").searchParams)
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const { port } = server.address() as AddressInfo
  return {
    redirectUrl: `http://127.0.0.1:${port}/callback`,
    received,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

// What the SDK asks of a client: somewhere to keep its registration, its
// tokens, the PKCE verifier, and what it discovered. Kept in memory for one
// sign-in. `redirectToAuthorization` records the address instead of opening
// a browser; the test opens it.
class TestClientProvider implements OAuthClientProvider {
  private client?: StoredOAuthClientInformation
  private saved?: StoredOAuthTokens
  private verifier?: string
  private discovery?: OAuthDiscoveryState
  // Sent with the request and checked on the way back, as a client must.
  readonly expectedState = randomBytes(16).toString("hex")
  authorizationUrl?: URL

  constructor(
    readonly redirectUrl: string,
    private readonly name: string
  ) {}

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.name,
      redirect_uris: [this.redirectUrl],
      // A public client: the code is protected by PKCE, not a secret.
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }
  }
  state() {
    return this.expectedState
  }
  clientInformation() {
    return this.client
  }
  saveClientInformation(client: StoredOAuthClientInformation) {
    this.client = client
  }
  tokens() {
    return this.saved
  }
  saveTokens(tokens: StoredOAuthTokens) {
    this.saved = tokens
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url
  }
  saveCodeVerifier(verifier: string) {
    this.verifier = verifier
  }
  codeVerifier() {
    if (!this.verifier) throw new Error("No authorization was started")
    return this.verifier
  }
  discoveryState() {
    return this.discovery
  }
  saveDiscoveryState(state: OAuthDiscoveryState) {
    this.discovery = state
  }
}

export type Consent = {
  baseURL: string
  // Who the browser is signed in as; the consent page says so.
  email: string
  decision: "approve" | "deny"
  clientName?: string
}

// The whole sign-in, as a client goes through it: a first request that is
// refused and starts the flow, the consent page in the browser, the code
// coming back, and the exchange. Returns a connected client when approved,
// and in every case what the callback received.
export async function connectThroughOAuth(page: Page, consent: Consent) {
  const { baseURL, decision, clientName = "E2E agent" } = consent
  const callback = await listenForCallback()
  const provider = new TestClientProvider(callback.redirectUrl, clientName)
  const url = new URL(`${baseURL}${MCP_PATH}`)

  try {
    // The 401 sends the SDK through discovery and registration, and then to
    // `redirectToAuthorization`: the connect fails on purpose, with the
    // address of the consent flow in hand.
    const first = new StreamableHTTPClientTransport(url, { authProvider: provider })
    await expect(new Client({ name: "subcanvas-e2e", version: "0.1.0" }).connect(first)).rejects.toBeInstanceOf(
      UnauthorizedError
    )
    const authorize = provider.authorizationUrl
    if (!authorize) throw new Error("The client was not sent anywhere to sign in")

    // Supabase records the request and sends the browser to its Site URL
    // plus the consent path. Locally the Site URL is the dev server's
    // address, not the build under test, so the redirect is read here and
    // followed on the test's own origin.
    const sent = await fetch(authorize, { redirect: "manual" })
    expect([302, 303]).toContain(sent.status)
    const location = new URL(sent.headers.get("location") ?? "", authorize)
    expect(location.pathname).toBe("/oauth/consent")
    expect(location.searchParams.get("authorization_id")).toBeTruthy()
    await page.goto(`${baseURL}${location.pathname}${location.search}`)

    await expect(cardTitled(page, `Let ${clientName} use Subcanvas as you?`)).toBeVisible()
    await expect(page.getByText(`You are signed in as ${consent.email}.`)).toBeVisible()
    // The code goes to a loopback address, and the page says what that means.
    await expect(page.getByText("It is an app running on this computer.")).toBeVisible()
    await page
      .getByRole("button", { name: decision === "approve" ? `Allow ${clientName}` : "Cancel", exact: true })
      .click()

    const params = await callback.received
    expect(params.get("state")).toBe(provider.expectedState)
    if (decision === "deny") return { client: null, provider, params }

    const code = params.get("code")
    if (!code) throw new Error(`No code came back: ${params}`)
    await first.finishAuth(code, params.get("iss") ?? undefined)

    // A fresh transport for the real session: the first one was only ever
    // there to be refused.
    const client = new Client({ name: "subcanvas-e2e", version: "0.1.0" })
    await client.connect(new StreamableHTTPClientTransport(url, { authProvider: provider }))
    return { client, provider, params }
  } finally {
    await callback.close()
  }
}

// Calls a tool and returns its structured result, failing the test on a
// tool error with the tool's own words.
export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  expect(result.isError, `${name}: ${firstText(result)}`).toBeFalsy()
  return result.structuredContent as Record<string, unknown>
}

// Calls a tool that should be refused, and returns what it said.
export async function refusedTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  expect(result.isError, `${name} should have been refused`).toBe(true)
  return firstText(result)
}

function firstText(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as { type: string; text?: string }[] | undefined
  return content?.find((block) => block.type === "text")?.text ?? ""
}

// Reads the clipboard of the page. The browser context has to have been
// granted `clipboard-read` for the origin.
export function readClipboard(page: Page) {
  return page.evaluate(() => navigator.clipboard.readText())
}

// Invites `email` to the org as a viewer and returns the invite link, taken
// from the clipboard the "Copy link" button writes it to.
export async function inviteViewer(page: Page, slug: string, email: string): Promise<string> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin })
  await page.goto(`/${slug}/settings/members`)
  await page.getByRole("combobox", { name: "Role" }).click()
  await page.getByRole("option", { name: "Viewer" }).click()
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Invite", exact: true }).click()
  const row = page.getByRole("row").filter({ hasText: email })
  await row.getByRole("button", { name: "Copy link" }).click()
  await expect(page.getByText("Invite link copied.")).toBeVisible()
  const link = await readClipboard(page)
  expect(link).toMatch(/\/invite\/[0-9a-f-]{36}$/)
  return link
}
