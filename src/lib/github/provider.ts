// What an import needs from wherever a repository is hosted: what the
// repository is, which files it has, and the text of one file. GitHub is the
// only host today (github-provider.ts). Anything specific to a host stays
// behind this, so a second one is one more file. See docs/ROADMAP.md,
// section 3.

export type RepositoryReference = { owner: string; name: string }

export type Repository = {
  // "owner/name", spelled the way the host spells it.
  repository: string
  // The default branch, and the commit it pointed at when the import ran.
  // Every file is read at that commit, so one import is one consistent state.
  ref: string
  commit: string
  description: string
}

export type RepositoryFile = { path: string; size: number }

// Folders are not listed: git has no empty ones, so the files imply them.
export type RepositoryTree = { files: RepositoryFile[] }

export interface RepositoryProvider {
  describe(reference: RepositoryReference): Promise<Repository>
  listFiles(repository: Repository): Promise<RepositoryTree>
  // Null when the file does not exist or is not text worth reading.
  readFile(repository: Repository, path: string): Promise<string | null>
}

export type RepositoryErrorKind =
  | "not_found"
  | "rate_limited"
  | "too_large"
  | "nothing_to_map"
  | "unavailable"

// A failure the person importing can do something about, worded for them.
export class RepositoryError extends Error {
  constructor(
    readonly kind: RepositoryErrorKind,
    message: string
  ) {
    super(message)
    this.name = "RepositoryError"
  }
}
