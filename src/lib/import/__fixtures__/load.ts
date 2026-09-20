import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { zipSync } from "fflate"

// The sample exports next to this file, as the tests need them: every file
// with its bytes, keyed by its path inside the sample.
export function fixtureFiles(sample: "notion" | "obsidian" | "docs") {
  const root = join(__dirname, sample)
  const files: Record<string, Uint8Array> = {}
  const walk = (folder: string, prefix: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(join(folder, entry.name), path)
      else files[path] = new Uint8Array(readFileSync(join(folder, entry.name)))
    }
  }
  walk(root, "")
  return files
}

export const zipOf = (files: Record<string, Uint8Array>) => new Blob([zipSync(files) as BlobPart])

export const picked = (files: Record<string, Uint8Array>) =>
  Object.entries(files).map(([path, bytes]) => ({ path, file: new Blob([bytes as BlobPart]) }))
