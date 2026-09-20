import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { readOrgAccess } from "@/lib/org-access"
import type { Database } from "@/lib/supabase/database.types"

import { createFixtureProvider, FIXTURE_OWNER, fixturesFolder } from "./fixture-provider"
import { createGitHubProvider, gitHubAppCredentials } from "./github-provider"
import { importRepository, type ImportOutcome } from "./import-repository"
import { parseRepositoryReference } from "./reference"

// Draws a public GitHub repository, given the way a person would name it
// ("owner/name" or its address), as a new project in an org. The import
// dialog and the MCP tool both come through here.
export async function importFromReference(
  supabase: SupabaseClient<Database>,
  { orgId, userId, repository, makePublic }: {
    orgId: string
    userId: string
    repository: string
    makePublic: boolean
  }
): Promise<ImportOutcome> {
  const reference = parseRepositoryReference(repository)
  if (!reference)
    return { error: "Enter a GitHub repository as owner/name, or paste its address." }

  // Checked before GitHub is asked anything. The database checks again.
  const access = await readOrgAccess(supabase, userId, orgId)
  if (!access?.canEdit) return { error: "You do not have permission to create projects." }

  const fixtures = fixturesFolder()
  const provider =
    fixtures && reference.owner === FIXTURE_OWNER
      ? createFixtureProvider(fixtures)
      : createGitHubProvider(gitHubAppCredentials())

  return importRepository(supabase, provider, reference, { orgId, userId, makePublic })
}
