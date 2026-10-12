import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { recordStep } from "@/lib/activity"
import { readOrgAccess } from "@/lib/org-access"
import { hasRole } from "@/lib/roles"
import type { Database } from "@/lib/supabase/database.types"

import { createFixtureProvider, FIXTURE_OWNER, fixturesFolder } from "./fixture-provider"
import { createGitHubProvider, gitHubAppCredentials } from "./github-provider"
import { importRepository, type ImportOutcome } from "./import-repository"
import { parseRepositoryReference } from "./reference"

// Draws a public GitHub repository, given the way a person would name it
// ("owner/name" or its address), as a new project in an org. The import
// dialog and the MCP tool both come through here.
//
// Left unsaid, the project is public when the person may make projects
// public (an admin or owner), since the repository already is, and private
// otherwise. The dialog shows that choice, ticked or not, and an agent that
// says nothing gets the same.
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

  const fixtures = fixturesFolder()
  const provider =
    fixtures && reference.owner === FIXTURE_OWNER
      ? createFixtureProvider(fixtures)
      : createGitHubProvider(gitHubAppCredentials())

  const outcome = await importRepository(supabase, provider, reference, {
    orgId,
    userId,
    makePublic: makePublic ?? hasRole(access.role, "admin"),
  })
  if ("ok" in outcome) await recordStep(supabase, "imported_repository")
  else await recordStep(supabase, `import_refused_${outcome.reason}`)
  return outcome
}

async function refused(supabase: SupabaseClient<Database>, outcome: Extract<ImportOutcome, { error: string }>) {
  await recordStep(supabase, `import_refused_${outcome.reason}`)
  return outcome
}
