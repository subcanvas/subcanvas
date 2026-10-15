import { RepositoryError, type RepositoryProvider, type RepositoryReference } from "./provider"

// A repository held in memory, as a map of paths to text: the playground's
// example (lib/playground/example-repository.ts). It is public, on "main".
export function createMemoryProvider(reference: RepositoryReference, files: Record<string, string>): RepositoryProvider {
  const name = `${reference.owner}/${reference.name}`
  return {
    async describe({ owner, name: asked }) {
      if (`${owner}/${asked}` !== name) throw new RepositoryError("not_found", `There is no repository named ${owner}/${asked}.`)
      return { repository: name, ref: "main", commit: "0".repeat(40), description: "", private: false }
    },
    async listFiles() {
      return {
        files: Object.entries(files).map(([path, text]) => ({ path, size: new TextEncoder().encode(text).length })),
      }
    },
    async readFile(_, path) {
      return files[path] ?? null
    },
  }
}
