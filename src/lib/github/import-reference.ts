import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { recordStep } from "@/lib/activity"
import { readOrgAccess } from "@/lib/org-access"
import { hasRole } from "@/lib/roles"
import type { Database } from "@/lib/supabase/database.types"

import { createFixtureProvider, FIXTURE_OWNER, fixturesFolder } from "./fixture-provider"
import { gitHubAppConfig } from "./app"
import { createGitHubProvider, gitHubAppCredentials } from "./github-provider"
import { importRepository, type ImportOutcome } from "./import-repository"
import { accessFor } from "./installations"
import { RepositoryError, type RepositoryProvider, type RepositoryReference } from "./provider"
import { parseRepositoryReference } from "./reference"

// Draws a GitHub repository, given the way a person would name it
// ("owner/name" or its address), as a new project in an org. The import
// dialog and the MCP tool both come through here. A public repository can
// always be read; a private one when the workspace has connected the account
// that owns it (Connect GitHub, lib/github/installations.ts).
//
// Left unsaid, a public repository's project is public when the person may
// make projects public (an admin or owner), since the repository already is,
// and private otherwise. The dialog shows that choice, ticked or not, and an
// agent that says nothing gets the same. A private repository always makes a
// private project, whatever is asked.
export async function importFromReference(
  supabase: SupabaseClient<Database>,
  { orgId, userId, repository, makePublic }: {
    orgId: string
    userId: string
    repository: string
    makePublic?: boolean
  }
): Promise<ImportOutcome> {
  const reference = parseRepositoryReference(repository)
  if (!reference)
    return refused(supabase, { error: "Enter a GitHub repository as owner/name, or paste its address.", reason: "other" })

  // Checked before GitHub is asked anything. The database checks again.
  const access = await readOrgAccess(supabase, userId, orgId)
  if (!access?.canEdit)
    return refused(supabase, { error: "You do not have permission to create projects.", reason: "other" })

  let provider: RepositoryProvider
  try {
    const fixtures = fixturesFolder()
    const chosen =
      fixtures && reference.owner === FIXTURE_OWNER
        ? createFixtureProvider(fixtures)
        : await providerFor(supabase, orgId, reference)
    if ("error" in chosen) return refused(supabase, chosen)
    provider = chosen
  } catch (error) {
    if (error instanceof RepositoryError) return refused(supabase, { error: error.message, reason: error.kind })
    throw error
  }

  const outcome = await importRepository(supabase, provider, reference, {
    orgId,
    userId,
    makePublic: makePublic ?? hasRole(access.role, "admin"),
  })
  if ("ok" in outcome) await recordStep(supabase, "imported_repository")
  else await recordStep(supabase, `import_refused_${outcome.reason}`)
  return outcome
}

// The workspace's connection to the repository's owner, when it has one;
// otherwise public repositories only, as the OAuth app.
async function providerFor(
  supabase: SupabaseClient<Database>,
  orgId: string,
  reference: RepositoryReference
): Promise<RepositoryProvider | Extract<ImportOutcome, { error: string }>> {
  const access = await accessFor(supabase, orgId, reference)
  if (access.kind === "broken")
    return {
      error: `This workspace's GitHub connection to ${access.connection.login} no longer works: the app may have been uninstalled there. An admin can connect it again in Settings.`,
      reason: "unavailable",
    }
  if (access.kind === "connected")
    return createGitHubProvider(undefined, {
      installationToken: access.token,
      notFound: `This workspace's GitHub connection to ${access.connection.login} cannot read a repository by that name. An admin can choose which repositories it reads in Settings.`,
    })
  return createGitHubProvider(gitHubAppCredentials(), {
    notFound: gitHubAppConfig()
      ? "There is no public repository by that name. To import a private one, an admin can connect GitHub in this workspace's Settings."
      : "There is no public repository by that name.",
  })
}

async function refused(supabase: SupabaseClient<Database>, outcome: Extract<ImportOutcome, { error: string }>) {
  await recordStep(supabase, `import_refused_${outcome.reason}`)
  return outcome
}
