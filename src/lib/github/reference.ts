import type { RepositoryReference } from "./provider"

// GitHub's own rules: an owner is up to 39 letters, digits, and single
// hyphens; a repository name is letters, digits, dots, hyphens, underscores.
const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})"
const NAME = "[A-Za-z0-9._-]{1,100}"

const SHORTHAND = new RegExp(`^(${OWNER})/(${NAME})$`)
// A pasted address may carry more than the repository (/tree/main/docs, a
// query, a fragment). Everything after the name is ignored.
const ADDRESS = new RegExp(`^(?:https?://)?(?:www\\.)?github\\.com/(${OWNER})/(${NAME})(?:[/?#].*)?$`)

// Reads "owner/name" or a github.com address. The host is matched, never
// used: requests are built from the owner and name alone, so nothing a
// person types can point the server at another machine.
export function parseRepositoryReference(input: string): RepositoryReference | null {
  const trimmed = input.trim()
  if (trimmed.length > 300) return null

  const match = SHORTHAND.exec(trimmed) ?? ADDRESS.exec(trimmed)
  if (!match) return null

  const owner = match[1]
  const name = match[2].replace(/\.git$/i, "")
  if (!name || name === "." || name === "..") return null
  return { owner, name }
}
