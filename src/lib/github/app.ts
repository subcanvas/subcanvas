import "server-only"

import { createSign } from "node:crypto"

// The GitHub App behind Connect GitHub (docs/ROADMAP.md, section 3). A
// workspace connects a GitHub account or organization by installing the app
// on it, and its editors can then import the private repositories that
// installation was granted. The app may read contents and metadata and
// nothing else, and only of the repositories chosen when it was installed.
//
// Separate from the OAuth app that offers "Continue with GitHub", which only
// signs people in (github-provider.ts reads public repositories as it).
// Nothing GitHub hands out is kept: the app asks for a token for one
// installation when it reads, and it expires within the hour.

const API = "https://api.github.com"
const WEB = "https://github.com"
const REQUEST_TIMEOUT_MS = 15_000

export type GitHubAppConfig = {
  appId: string
  clientId: string
  slug: string
  clientSecret: string
  privateKey: string
}

// APP_ID_GITHUB, APP_CLIENT_ID_GITHUB, APP_SLUG_GITHUB, and the secrets
// APP_CLIENT_SECRET_GITHUB and APP_PRIVATE_KEY_GITHUB. All five or none:
// without them Connect GitHub is not offered at all.
export function gitHubAppConfig(): GitHubAppConfig | null {
  const appId = process.env.APP_ID_GITHUB
  const clientId = process.env.APP_CLIENT_ID_GITHUB
  const slug = process.env.APP_SLUG_GITHUB
  const clientSecret = process.env.APP_CLIENT_SECRET_GITHUB
  // A key pasted onto one line keeps its line breaks as "\n".
  const privateKey = process.env.APP_PRIVATE_KEY_GITHUB?.replace(/\\n/g, "\n")
  if (!appId || !clientId || !slug || !clientSecret || !privateKey) return null
  return { appId, clientId, slug, clientSecret, privateKey }
}

export class GitHubAppError extends Error {}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url")

// The app's own identity: a JSON Web Token signed with its private key, good
// for ten minutes at most. Backdated a minute for a clock that runs ahead.
export function appJwt(config: Pick<GitHubAppConfig, "appId" | "privateKey">, now = Date.now()) {
  const seconds = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64url(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: config.appId }))
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(config.privateKey)
  return `${header}.${payload}.${base64url(signature)}`
}

async function github(path: string, init: RequestInit & { authorization?: string; headers?: Record<string, string> }) {
  const { authorization, ...rest } = init
  let response: Response
  try {
    response = await fetch(path.startsWith("https://") ? path : `${API}${path}`, {
      ...rest,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "subcanvas",
        ...(authorization ? { authorization } : {}),
        ...rest.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    })
  } catch {
    throw new GitHubAppError("GitHub did not answer. Try again in a moment.")
  }
  return response
}

// A token that reads one installation's repositories, from a cache until a
// few minutes before it runs out. Null when the installation is gone: it was
// uninstalled, or its account suspended it.
const tokens = new Map<number, { token: string; expiresAt: number }>()

export async function installationToken(config: GitHubAppConfig, installationId: number): Promise<string | null> {
  const cached = tokens.get(installationId)
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token

  const response = await github(`/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    authorization: `Bearer ${appJwt(config)}`,
  })
  if (response.status === 404 || response.status === 403) {
    tokens.delete(installationId)
    return null
  }
  if (!response.ok) throw new GitHubAppError(`GitHub answered with an error (${response.status}). Try again in a moment.`)
  const data: { token?: unknown; expires_at?: unknown } = await response.json()
  if (typeof data.token !== "string" || typeof data.expires_at !== "string")
    throw new GitHubAppError("GitHub gave an answer that could not be read.")
  tokens.set(installationId, { token: data.token, expiresAt: Date.parse(data.expires_at) })
  return data.token
}

export type InstallationAccount = { login: string; type: "User" | "Organization" }

// The account an installation is on, asked as the app.
export async function installationAccount(config: GitHubAppConfig, installationId: number): Promise<InstallationAccount | null> {
  const response = await github(`/app/installations/${installationId}`, { authorization: `Bearer ${appJwt(config)}` })
  if (!response.ok) return null
  const data: { account?: { login?: unknown; type?: unknown } } = await response.json()
  const login = data.account?.login
  const type = data.account?.type
  if (typeof login !== "string" || (type !== "User" && type !== "Organization")) return null
  return { login, type }
}

export type ConnectedRepository = { repository: string; private: boolean }

// The repositories an installation was granted, up to 1,000.
export async function installationRepositories(token: string): Promise<ConnectedRepository[]> {
  const repositories: ConnectedRepository[] = []
  for (let page = 1; page <= 10; page++) {
    const response = await github(`/installation/repositories?per_page=100&page=${page}`, {
      authorization: `Bearer ${token}`,
    })
    if (!response.ok) throw new GitHubAppError(`GitHub answered with an error (${response.status}). Try again in a moment.`)
    const data: { repositories?: { full_name?: unknown; private?: unknown }[] } = await response.json()
    const found = (data.repositories ?? []).flatMap((entry) =>
      typeof entry.full_name === "string" ? [{ repository: entry.full_name, private: entry.private !== false }] : []
    )
    repositories.push(...found)
    if (found.length < 100) break
  }
  return repositories
}

// Where to send someone to install the app, or to change which repositories
// an existing installation can read. GitHub hands `state` back, with a code
// that proves who they are and the installation's id.
export function installUrl(config: Pick<GitHubAppConfig, "slug">, state: string) {
  return `${WEB}/apps/${encodeURIComponent(config.slug)}/installations/new?state=${encodeURIComponent(state)}`
}

// Where to manage an installation on GitHub: which repositories, or
// uninstalling it. An organization's are under the organization.
export function installationSettingsUrl(account: InstallationAccount, installationId: number) {
  return account.type === "Organization"
    ? `${WEB}/organizations/${encodeURIComponent(account.login)}/settings/installations/${installationId}`
    : `${WEB}/settings/installations/${installationId}`
}

// Whether the person GitHub sent back with `code` can see the installation:
// they installed it, or are a member of the organization it is on. The code
// becomes a token for them, used for this one question and then revoked, so
// nobody can connect an installation id they only know the number of.
export async function personCanSeeInstallation(config: GitHubAppConfig, code: string, installationId: number) {
  const exchange = await github(`${WEB}/login/oauth/access_token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code }),
  })
  const data: { access_token?: unknown } = exchange.ok ? await exchange.json() : {}
  if (typeof data.access_token !== "string") return false
  const userToken = data.access_token

  try {
    for (let page = 1; page <= 10; page++) {
      const response = await github(`/user/installations?per_page=100&page=${page}`, {
        authorization: `Bearer ${userToken}`,
      })
      if (!response.ok) return false
      const listed: { installations?: { id?: unknown }[] } = await response.json()
      const ids = (listed.installations ?? []).map((installation) => installation.id)
      if (ids.includes(installationId)) return true
      if (ids.length < 100) return false
    }
    return false
  } finally {
    // Not needed again, so not left to run out on its own.
    await github(`/applications/${encodeURIComponent(config.clientId)}/token`, {
      method: "DELETE",
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      body: JSON.stringify({ access_token: userToken }),
    }).catch(() => undefined)
  }
}
