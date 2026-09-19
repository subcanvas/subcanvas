import { baseName, depthOf, isInside, parentPath, ROOT, selfAndAncestors } from "./paths"
import type { RepositoryFile } from "./provider"
import { SUBCANVAS_FILE_NAME } from "./subcanvas-file"

// Which folders of a repository become nodes. Not every folder has design
// relevance, and a first diagram with four hundred boxes shows nothing. The
// rules are the ones in docs/ROADMAP.md, section 3. They will be wrong
// sometimes; deleting a node is one click, and a `.subcanvas` file is the
// way to include a folder the rules skipped.

export type MappedFolder = {
  path: string
  // The folder whose whiteboard this one's node sits on. The root means the
  // top whiteboard. Always mapped too.
  parent: string
  readme: RepositoryFile | null
  hasSubcanvasFile: boolean
}

export type Mapping = {
  folders: MappedFolder[]
  // The repository's own README, for the top whiteboard.
  rootReadme: RepositoryFile | null
  // More folders qualified than one import draws.
  capped: boolean
}

export const MAX_MAPPED_FOLDERS = 60
// The automatic pass looks this far down. A `.subcanvas` file maps a folder
// at any depth.
const MAX_AUTOMATIC_DEPTH = 2

// Folders whose children are the parts of the system, by convention.
const CONVENTIONAL_ROOTS = new Set(["services", "apps", "packages", "cmd", "internal", "libs", "modules"])

// Dependencies and build output. Never mapped, whatever is inside.
const SKIPPED = new Set([
  "node_modules", "bower_components", "vendor", "third_party", "dist", "build", "out", "target",
  "coverage", "__pycache__", "venv",
])

// Real folders that are about the code rather than part of the design. They
// tend to be large (an `examples` folder with forty READMEs), so the
// automatic pass leaves them out; a `.subcanvas` file brings one back.
const SUPPORTING = new Set([
  "docs", "doc", "documentation", "examples", "example", "samples", "demo", "demos", "test",
  "tests", "__tests__", "e2e", "testdata", "fixtures", "__fixtures__", "benchmarks", "bench",
])

const CODE_FILE = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|kts|rb|php|cs|fs|swift|scala|c|h|cc|cpp|hpp|m|mm|ex|exs|erl|clj|hs|lua|dart|vue|svelte|zig|sql|sh)$/i

// README.md first, then the other spellings people use.
const README_NAMES = ["readme.md", "readme.markdown", "readme.mdown", "readme"]

function isSkipped(path: string) {
  return path.split("/").some((segment) => segment.startsWith(".") || SKIPPED.has(segment.toLowerCase()))
}

function isSupporting(path: string) {
  return path.split("/").some((segment) => SUPPORTING.has(segment.toLowerCase()))
}

// The `.subcanvas` files worth reading, keyed by their folder.
export function findSubcanvasFiles(files: RepositoryFile[]): Map<string, RepositoryFile> {
  const found = new Map<string, RepositoryFile>()
  for (const file of files) {
    if (baseName(file.path) !== SUBCANVAS_FILE_NAME) continue
    const folder = parentPath(file.path)
    if (folder === ROOT || !isSkipped(folder)) found.set(folder, file)
  }
  return found
}

export function mapFolders(files: RepositoryFile[], ignored: string[] = []): Mapping {
  const readmes = new Map<string, RepositoryFile>()
  const withSubcanvasFile = new Set<string>()
  const withCode = new Set<string>()
  const folders = new Set<string>()

  for (const file of files) {
    const folder = parentPath(file.path)
    const name = baseName(file.path).toLowerCase()
    if (folder !== ROOT && (isSkipped(folder) || ignored.some((path) => isInside(folder, path)))) continue

    // Once a folder is known, so is everything above it.
    const isCode = CODE_FILE.test(name)
    for (const path of selfAndAncestors(folder)) {
      if (isCode ? withCode.has(path) : folders.has(path)) break
      folders.add(path)
      if (isCode) withCode.add(path)
    }
    if (name === SUBCANVAS_FILE_NAME) withSubcanvasFile.add(folder)
    const rank = README_NAMES.indexOf(name)
    const current = readmes.get(folder)
    if (rank !== -1 && (!current || rank < README_NAMES.indexOf(baseName(current.path).toLowerCase())))
      readmes.set(folder, file)
  }

  const describesItself = (path: string) => readmes.has(path) || withSubcanvasFile.has(path)
  const childrenOf = (root: string) =>
    [...folders].filter((path) => parentPath(path).toLowerCase() === root && !isSupporting(path))

  let qualifying = [...folders].filter((path) => {
    if (withSubcanvasFile.has(path)) return true
    if (isSupporting(path) || depthOf(path) > MAX_AUTOMATIC_DEPTH) return false
    return describesItself(path) || CONVENTIONAL_ROOTS.has(parentPath(path).toLowerCase())
  })
  // A small project keeps everything under src/, so its parts are the
  // folders in there. In a larger one src/ is an implementation detail.
  if (!qualifying.length) qualifying = childrenOf("src")
  // Last resort: the top-level folders that hold code.
  if (!qualifying.length)
    qualifying = childrenOf(ROOT).filter((path) => withCode.has(path))

  // When there are too many, keep what someone asked for by name, then what
  // is nearest the top.
  qualifying.sort(
    (a, b) =>
      Number(withSubcanvasFile.has(b)) - Number(withSubcanvasFile.has(a)) ||
      depthOf(a) - depthOf(b) ||
      a.localeCompare(b)
  )

  // A folder is drawn on its parent's whiteboard, so everything above a
  // mapped folder is mapped with it.
  const mapped = new Set<string>()
  let capped = false
  for (const path of qualifying) {
    const added = selfAndAncestors(path).filter((ancestor) => !mapped.has(ancestor))
    if (mapped.size + added.length > MAX_MAPPED_FOLDERS) {
      capped = true
      continue
    }
    for (const ancestor of added) mapped.add(ancestor)
  }

  return {
    folders: [...mapped].sort((a, b) => a.localeCompare(b)).map((path) => ({
      path,
      parent: parentPath(path),
      readme: readmes.get(path) ?? null,
      hasSubcanvasFile: withSubcanvasFile.has(path),
    })),
    rootReadme: readmes.get(ROOT) ?? null,
    capped,
  }
}
