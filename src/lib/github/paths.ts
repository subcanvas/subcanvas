// Folder paths inside a repository: no leading or trailing slash, and the
// root is the empty string.

export const ROOT = ""

export function parentPath(path: string) {
  const slash = path.lastIndexOf("/")
  return slash === -1 ? ROOT : path.slice(0, slash)
}

export function baseName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1)
}

export function joinPath(folder: string, relative: string) {
  return folder ? `${folder}/${relative}` : relative
}

export function depthOf(path: string) {
  return path === ROOT ? 0 : path.split("/").length
}

// The folder itself, then each folder above it, not including the root.
export function selfAndAncestors(path: string) {
  const chain: string[] = []
  for (let at = path; at !== ROOT; at = parentPath(at)) chain.push(at)
  return chain
}

export function isInside(path: string, folder: string) {
  return path === folder || path.startsWith(`${folder}/`)
}

// A path someone wrote by hand in a `.subcanvas` file, tidied: "./a/b/" and
// "/a/b" both mean "a/b". Null when it tries to leave the repository or is
// not a path at all.
export function normalizePath(input: string): string | null {
  const segments = input
    .trim()
    .replace(/^\.?\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter((segment) => segment !== ".")
  if (!segments.length || input.includes("\\") || input.includes("\0")) return null
  if (segments.some((segment) => segment === "" || segment === "..")) return null
  return segments.join("/")
}
