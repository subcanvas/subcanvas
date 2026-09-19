import "server-only"

import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, sep } from "node:path"

import { RepositoryError, type RepositoryProvider } from "./provider"

// A repository that is a folder on this machine, for development: almost no
// repository on GitHub has `.subcanvas` files yet, and this is how that path
// is exercised end to end without publishing one. It is reachable only when
// SUBCANVAS_IMPORT_FIXTURES names a folder and the server is not running in
// production; then "fixture/<name>" imports <that folder>/<name>.
export const FIXTURE_OWNER = "fixture"

export function fixturesFolder() {
  return process.env.NODE_ENV === "production" ? undefined : process.env.SUBCANVAS_IMPORT_FIXTURES
}

async function walk(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? walk(join(folder, entry.name)) : entry.isFile() ? [join(folder, entry.name)] : []
    )
  )
  return nested.flat()
}

export function createFixtureProvider(fixtures: string): RepositoryProvider {
  // The name has already passed the same pattern as a GitHub repository
  // name, so it is a single path segment.
  const folderOf = (repository: string) => join(fixtures, repository.slice(FIXTURE_OWNER.length + 1))

  return {
    async describe({ owner, name }) {
      const repository = `${owner}/${name}`
      const found = await stat(folderOf(repository)).catch(() => null)
      if (!found?.isDirectory()) throw new RepositoryError("not_found", `There is no fixture named ${name}.`)
      return { repository, ref: "main", commit: "0".repeat(40), description: "A fixture repository." }
    },

    async listFiles({ repository }) {
      const root = folderOf(repository)
      const paths = await walk(root)
      const files = await Promise.all(
        paths.map(async (path) => ({
          path: relative(root, path).split(sep).join("/"),
          size: (await stat(path)).size,
        }))
      )
      return { files }
    },

    readFile({ repository }, path) {
      return readFile(join(folderOf(repository), path), "utf8").catch(() => null)
    },
  }
}
