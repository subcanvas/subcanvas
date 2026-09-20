import "server-only"

import {
  RepositoryError,
  type Repository,
  type RepositoryProvider,
  type RepositoryReference,
} from "./provider"

// Public repositories on github.com, read without a GitHub App. Only two
// hosts are ever contacted, and both are written here, not taken from input.
const API = "https://api.github.com"
const RAW = "https://raw.githubusercontent.com"

const REQUEST_TIMEOUT_MS = 15_000
export const MAX_FILE_BYTES = 200_000

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/")

function resetTime(response: Response) {
  const reset = Number(response.headers.get("x-ratelimit-reset"))
  if (!reset) return "in a while"
  const minutes = Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000))
  return `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`
}

// An OAuth app's own id and secret, which GitHub accepts in place of a user
// for reading public data. Anonymous, GitHub allows 60 requests an hour from
// one address, and an import takes three; as an OAuth app it allows 5,000.
// There is no token for anyone to create or rotate, and the credentials can
// read nothing a stranger could not: a private repository is refused.
export type GitHubAppCredentials = { clientId: string; clientSecret: string }

// Reads OAUTH_CLIENT_ID_GITHUB and OAUTH_CLIENT_SECRET_GITHUB: the same app
// that offers "Continue with GitHub", or any other. Both or neither.
export function gitHubAppCredentials(): GitHubAppCredentials | undefined {
  const clientId = process.env.OAUTH_CLIENT_ID_GITHUB
  const clientSecret = process.env.OAUTH_CLIENT_SECRET_GITHUB
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

export function createGitHubProvider(credentials: GitHubAppCredentials | undefined): RepositoryProvider {
  const authorization = credentials
    ? `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`
    : undefined

  async function api(path: string, accept = "application/vnd.github+json") {
    let response: Response
    try {
      response = await fetch(`${API}${path}`, {
        headers: {
          accept,
          "x-github-api-version": "2022-11-28",
          "user-agent": "subcanvas",
          ...(authorization ? { authorization } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      })
    } catch {
      throw new RepositoryError("unavailable", "GitHub did not answer. Try again in a moment.")
    }

    if (response.ok) return response
    const limited =
      response.status === 429 ||
      (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
    if (limited)
      throw new RepositoryError(
        "rate_limited",
        `GitHub is limiting how often this server may ask. Try again ${resetTime(response)}.`
      )
    if (response.status === 404 || response.status === 403 || response.status === 451)
      throw new RepositoryError(
        "not_found",
        "There is no public repository by that name. Private repositories cannot be imported yet."
      )
    throw new RepositoryError("unavailable", `GitHub answered with an error (${response.status}). Try again in a moment.`)
  }

  return {
    async describe({ owner, name }: RepositoryReference) {
      const response = await api(`/repos/${owner}/${name}`)
      const data: { full_name?: unknown; default_branch?: unknown; description?: unknown; private?: unknown } =
        await response.json()
      if (data.private !== false || typeof data.full_name !== "string" || typeof data.default_branch !== "string")
        throw new RepositoryError(
          "not_found",
          "There is no public repository by that name. Private repositories cannot be imported yet."
        )

      let commit: string
      try {
        // This media type answers with the commit id and nothing else.
        const head = await api(
          `/repos/${data.full_name}/commits/${encodeURIComponent(data.default_branch)}`,
          "application/vnd.github.sha"
        )
        commit = (await head.text()).trim()
      } catch (error) {
        // A repository with no commits has no default branch to read.
        if (error instanceof RepositoryError && error.kind === "not_found")
          throw new RepositoryError("not_found", "This repository is empty.")
        throw error
      }
      if (!/^[0-9a-f]{40,64}$/.test(commit))
        throw new RepositoryError("unavailable", "GitHub gave an answer that could not be read.")

      return {
        repository: data.full_name,
        ref: data.default_branch,
        commit,
        description: typeof data.description === "string" ? data.description : "",
      }
    },

    async listFiles(repository: Repository) {
      const response = await api(`/repos/${repository.repository}/git/trees/${repository.commit}?recursive=1`)
      const data: { tree?: unknown; truncated?: unknown } = await response.json()
      // GitHub cuts the listing off at 100,000 entries. A partial list would
      // draw a diagram with folders silently missing, so refuse instead.
      if (data.truncated === true || !Array.isArray(data.tree))
        throw new RepositoryError(
          "too_large",
          "This repository is too large to import: GitHub can only list part of it."
        )

      const files = data.tree.flatMap((entry: { type?: unknown; path?: unknown; size?: unknown }) =>
        entry.type === "blob" && typeof entry.path === "string"
          ? [{ path: entry.path, size: typeof entry.size === "number" ? entry.size : 0 }]
          : []
      )
      return { files }
    },

    async readFile(repository: Repository, path: string) {
      let response: Response
      try {
        response = await fetch(`${RAW}/${repository.repository}/${repository.commit}/${encodePath(path)}`, {
          headers: { "user-agent": "subcanvas" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        })
      } catch {
        return null
      }
      if (!response.ok) return null
      const text = await response.text()
      return text.length > MAX_FILE_BYTES ? null : text
    },
  }
}
