import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import {
  GitHubAppError,
  gitHubAppConfig,
  installationRepositories,
  installationToken,
  type ConnectedRepository,
  type InstallationAccount,
} from "./app"
import { RepositoryError, type RepositoryReference } from "./provider"

// A workspace's GitHub connections (migration github_connections): the
// installations of the GitHub App its editors may import from. Read with the
// person's own client, so row-level security says whose they are.

export type GitHubConnection = InstallationAccount & {
  installationId: number
  connectedAt: string
  connectedBy: string | null
}

export async function readConnections(supabase: SupabaseClient<Database>, orgId: string): Promise<GitHubConnection[]> {
  const { data } = await supabase
    .from("github_connections")
    .select("installation_id, account_login, account_type, connected_at, connected_by")
    .eq("org_id", orgId)
    .order("connected_at")
  return (data ?? []).map((row) => ({
    installationId: row.installation_id,
    login: row.account_login,
    type: row.account_type === "Organization" ? "Organization" : "User",
    connectedAt: row.connected_at,
    connectedBy: row.connected_by,
  }))
}

// Where a repository is read from: the workspace's connection to the account
// that owns it, when there is one and it still works, with a token for it.
// An installation is on one account, so the owner's name decides.
export type RepositoryAccess =
  | { kind: "connected"; connection: GitHubConnection; token: string }
  | { kind: "public" }
  | { kind: "broken"; connection: GitHubConnection }

export async function accessFor(
  supabase: SupabaseClient<Database>,
  orgId: string,
  reference: RepositoryReference
): Promise<RepositoryAccess> {
  const config = gitHubAppConfig()
  if (!config) return { kind: "public" }
  const connection = (await readConnections(supabase, orgId)).find(
    (candidate) => candidate.login.toLowerCase() === reference.owner.toLowerCase()
  )
  if (!connection) return { kind: "public" }
  let token: string | null
  try {
    token = await installationToken(config, connection.installationId)
  } catch (error) {
    if (error instanceof GitHubAppError) throw new RepositoryError("unavailable", error.message)
    throw error
  }
  return token ? { kind: "connected", connection, token } : { kind: "broken", connection }
}

export type ConnectedRepositories = { repositories: (ConnectedRepository & { account: string })[]; broken: string[] }

// Every repository the workspace's connections can read, for the import
// dialog to offer. A connection GitHub no longer honours (the app was
// uninstalled there) is named in `broken`, so an admin can remove it; one
// GitHub did not answer for is left out this time.
export async function connectedRepositories(
  supabase: SupabaseClient<Database>,
  orgId: string
): Promise<ConnectedRepositories> {
  const config = gitHubAppConfig()
  if (!config) return { repositories: [], broken: [] }
  const connections = await readConnections(supabase, orgId)
  const results = await Promise.all(
    connections.map(async (connection) => {
      try {
        const token = await installationToken(config, connection.installationId)
        if (!token) return { connection, repositories: null }
        return { connection, repositories: await installationRepositories(token) }
      } catch (error) {
        if (error instanceof GitHubAppError) return { connection, repositories: [] }
        throw error
      }
    })
  )
  return {
    repositories: results
      .flatMap(({ connection, repositories }) =>
        (repositories ?? []).map((repository) => ({ ...repository, account: connection.login }))
      )
      .sort((a, b) => a.repository.localeCompare(b.repository)),
    broken: results.filter((result) => !result.repositories).map((result) => result.connection.login),
  }
}
