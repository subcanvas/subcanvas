import type { Json } from "@/lib/supabase/database.types"

// The `source` column of a project or a document: where it was imported
// from. See docs/ROADMAP.md, "Shared foundation". A document with a source
// is owned by the repository and shown read-only here.

export type ProjectSource = {
  provider: "github"
  repository: string
  ref: string
  commit: string
}

export type DocumentSource = ProjectSource & { path: string }

// The column is JSON, so it is checked on the way out like anything else
// that was stored.
export function readProjectSource(value: Json | null | undefined): ProjectSource | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const { provider, repository, ref, commit } = value
  if (provider !== "github") return null
  if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return null
  if (typeof ref !== "string" || typeof commit !== "string") return null
  return { provider, repository, ref, commit }
}

export function readDocumentSource(value: Json | null): DocumentSource | null {
  const source = readProjectSource(value)
  if (!source || typeof value !== "object" || value === null || Array.isArray(value)) return null
  const { path } = value
  return typeof path === "string" ? { ...source, path } : null
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/")

// GitHub edits a file on a branch, not at a commit.
export function sourceEditUrl(source: DocumentSource) {
  return `https://github.com/${source.repository}/edit/${encodePath(source.ref)}/${encodePath(source.path)}`
}

// A folder of the repository at the imported branch, where its code is now.
export function sourceFolderUrl(source: ProjectSource, folder: string) {
  return `https://github.com/${source.repository}/tree/${encodePath(source.ref)}${folder ? `/${encodePath(folder)}` : ""}`
}

export function sourceViewUrl(source: DocumentSource) {
  return `https://github.com/${source.repository}/blob/${source.commit}/${encodePath(source.path)}`
}
