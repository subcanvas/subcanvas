// Paths of the files in an import: forward slashes, no leading slash, as a
// zip or a dropped folder names them.

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|tiff?|heic)$/i

export type FileKind = "markdown" | "csv" | "html" | "docx" | "zip" | "image" | "other"

export function kindOf(path: string): FileKind {
  if (/\.(md|markdown|mdown|txt)$/i.test(path)) return "markdown"
  if (/\.csv$/i.test(path)) return "csv"
  if (/\.html?$/i.test(path)) return "html"
  if (/\.docx$/i.test(path)) return "docx"
  if (/\.zip$/i.test(path)) return "zip"
  return IMAGE.test(path) ? "image" : "other"
}

// A path from a zip or a file picker, made safe to reason about. Null for
// one that must not be followed: absolute, climbing out with "..", or not a
// path at all. Zips made on Windows use backslashes.
export function safePath(raw: string): string | null {
  const path = raw.replace(/\\/g, "/")
  if (!path || path.includes("\0") || path.startsWith("/") || /^[a-z]:/i.test(path)) return null
  const segments = path.split("/").filter((segment) => segment !== "" && segment !== ".")
  if (!segments.length || segments.includes("..")) return null
  return segments.join("/")
}

// What an operating system or an app left lying around: macOS resource
// forks, dotfiles and dot folders (.obsidian, .git, .DS_Store), and
// dependencies.
export function isClutter(path: string) {
  return path
    .split("/")
    .some((segment) => segment.startsWith(".") || segment === "__MACOSX" || segment === "node_modules")
}

export function parentOf(path: string) {
  const slash = path.lastIndexOf("/")
  return slash === -1 ? "" : path.slice(0, slash)
}

export function baseName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1)
}

export function withoutExtension(name: string) {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}

// Where a link written in `fromPath` points, as a path in the import. Null
// when it leaves the import. Notion writes its links URL-encoded.
export function resolveRelative(fromPath: string, href: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(href)
  } catch {
    decoded = href
  }
  const segments = decoded.startsWith("/") ? [] : parentOf(fromPath).split("/").filter(Boolean)
  for (const segment of decoded.split("/")) {
    if (segment === "..") {
      if (!segments.length) return null
      segments.pop()
    } else if (segment && segment !== ".") segments.push(segment)
  }
  return segments.join("/") || null
}
