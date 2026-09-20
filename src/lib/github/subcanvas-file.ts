import { parse } from "yaml"

import { normalizePath } from "./paths"

// A `.subcanvas` file: what a folder is, and what it talks to. The format is
// documented for users in docs/SUBCANVAS_FILE.md. Every key is optional.
export type SubcanvasFile = {
  title: string | null
  description: string | null
  connects: SubcanvasConnection[]
  // Subfolders left out of the design, as paths from the repository root.
  ignore: string[]
}

export type SubcanvasConnection = {
  // A path from the repository root.
  to: string
  label: string
  description: string
}

export const SUBCANVAS_FILE_NAME = ".subcanvas"
export const MAX_SUBCANVAS_FILE_BYTES = 20_000

const MAX_TITLE = 120
const MAX_DESCRIPTION = 500
const MAX_LABEL = 80
const MAX_CONNECTION_DESCRIPTION = 2000
const MAX_PATH = 300
const MAX_CONNECTIONS = 50
const MAX_IGNORES = 100
const KNOWN_KEYS = ["title", "description", "connects", "ignore"]

const EMPTY: SubcanvasFile = { title: null, description: null, connects: [], ignore: [] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Reads one file. It never throws and never fails an import: whatever is
// wrong is left out and explained in `warnings`, and the rest is used. The
// file comes from a repository anyone may have written, so nothing in it is
// trusted: only strings are accepted, every string has a length cap, and
// YAML aliases are refused, since they are how a small file expands into an
// enormous one.
export function parseSubcanvasFile(
  text: string,
  folder: string
): { file: SubcanvasFile; warnings: string[] } {
  const where = folder ? `${folder}/${SUBCANVAS_FILE_NAME}` : SUBCANVAS_FILE_NAME
  const warnings: string[] = []
  const warn = (message: string) => warnings.push(`${where}: ${message}`)

  if (text.length > MAX_SUBCANVAS_FILE_BYTES) {
    warn("the file is too large and was ignored.")
    return { file: EMPTY, warnings }
  }

  let data: unknown
  try {
    data = parse(text, { maxAliasCount: 0, schema: "core", logLevel: "silent" })
  } catch {
    warn("this is not valid YAML, so the file was ignored.")
    return { file: EMPTY, warnings }
  }
  // An empty file is fine: it still says "map this folder".
  if (data === null || data === undefined) return { file: EMPTY, warnings }
  if (!isRecord(data)) {
    warn("expected keys such as `title` and `connects`, so the file was ignored.")
    return { file: EMPTY, warnings }
  }

  for (const key of Object.keys(data))
    if (!KNOWN_KEYS.includes(key)) warn(`\`${key.slice(0, 40)}\` is not a known key.`)

  const string = (value: unknown, name: string, max: number) => {
    if (value === undefined || value === null) return null
    if (typeof value !== "string") {
      warn(`\`${name}\` must be text.`)
      return null
    }
    const trimmed = value.trim()
    if (trimmed.length > max) warn(`\`${name}\` was cut to ${max} characters.`)
    return trimmed.slice(0, max) || null
  }

  const path = (value: unknown, name: string, base: string) => {
    const written = string(value, name, MAX_PATH)
    if (written === null) return null
    const normalized = normalizePath(written)
    if (normalized === null) {
      warn(`\`${name}: ${written}\` is not a path inside the repository.`)
      return null
    }
    return base ? `${base}/${normalized}` : normalized
  }

  const list = (value: unknown, name: string, max: number) => {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) {
      warn(`\`${name}\` must be a list.`)
      return []
    }
    if (value.length > max) warn(`\`${name}\` has more than ${max} entries; the rest were ignored.`)
    return value.slice(0, max)
  }

  const connects: SubcanvasConnection[] = []
  for (const entry of list(data.connects, "connects", MAX_CONNECTIONS)) {
    if (!isRecord(entry)) {
      warn("each entry under `connects` needs a `to`.")
      continue
    }
    const to = path(entry.to, "to", "")
    if (to === null) {
      if (entry.to === undefined) warn("each entry under `connects` needs a `to`.")
      continue
    }
    connects.push({
      to,
      label: string(entry.label, "label", MAX_LABEL) ?? "",
      description: string(entry.description, "connects.description", MAX_CONNECTION_DESCRIPTION) ?? "",
    })
  }

  // `ignore` names subfolders of this folder; `to` is from the root, because
  // a connection usually points somewhere else entirely.
  const ignore = list(data.ignore, "ignore", MAX_IGNORES).flatMap((entry) => {
    const ignored = path(entry, "ignore", folder)
    return ignored === null ? [] : [ignored]
  })

  return {
    file: {
      title: string(data.title, "title", MAX_TITLE),
      description: string(data.description, "description", MAX_DESCRIPTION),
      connects,
      ignore,
    },
    warnings,
  }
}
