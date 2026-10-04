import { sourceFolderUrl, type ProjectSource } from "@/lib/github/source"

import { MAX_CODE_URL } from "./limits"

// A code link: the address of the code behind a node or an arrow, a file or
// a folder on GitHub, GitLab, Bitbucket, Codeberg, or anywhere else that has
// an https address. Clicking it opens that address in a new tab. A box drawn
// for a repository folder by the import has one without storing it: it is
// worked out from the folder and the project's repository (`codeLinkOf`), so
// boxes imported before code links existed have one too.

// An address that may be stored and opened: https only, no credentials, a
// real host name, nothing too long. The address as written, trimmed, or
// null. Reads of the shared document go through this too, so whatever
// another client wrote, only an https address is ever made a link.
export function parseCodeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_CODE_URL || /\s/.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null
  return trimmed
}

// What someone typed or pasted into the panel, as an address to store, or
// why it cannot be one. An address without its scheme
// ("github.com/owner/name") is taken to mean https.
export function codeUrlFromInput(input: string): { url: string | null } | { problem: string } {
  const trimmed = input.trim()
  if (!trimmed) return { url: null }
  if (trimmed.length > MAX_CODE_URL) return { problem: `A link can be at most ${MAX_CODE_URL} characters.` }
  if (/^http:\/\//i.test(trimmed)) return { problem: "Only https links can be added." }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = parseCodeUrl(withScheme)
  return url ? { url } : { problem: "This is not a web address. Paste the https link to a file or folder." }
}

export type CodeLink = { url: string; derived: boolean }

// The link a node or an arrow opens: its own, or else the folder it was
// imported from, in the project's repository at the imported branch.
export function codeLinkOf(
  object: { codeUrl: string | null; path?: string | null },
  repository: ProjectSource | null
): CodeLink | null {
  if (object.codeUrl) return { url: object.codeUrl, derived: false }
  if (object.path && repository) return { url: sourceFolderUrl(repository, object.path), derived: true }
  return null
}

// How a code link is shown: `label` says what it points at, as briefly as
// says it ("packages/react/src/index.ts:10-20"), and `repository` whose it
// is ("facebook/react") when the label does not already say so. An address
// on no forge recognised here is shown as its host and path.
export type CodeLabel = { label: string; repository: string | null }

const decode = (segment: string) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

const lines = (start: string | undefined, end: string | undefined) =>
  start ? (end && end !== start ? `:${start}-${end}` : `:${start}`) : ""

// "#L10-L20", "#L10C5-L20C2", "#L10".
const GITHUB_LINES = /^#L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?$/
// "#L10-20", "#L10".
const GITLAB_LINES = /^#L(\d+)(?:-L?(\d+))?$/
// "#lines-10:20", "#lines-10".
const BITBUCKET_LINES = /^#lines-(\d+)(?::(\d+))?/

const FILE_VIEWS = new Set(["blob", "tree", "blame", "raw", "edit"])

// The repository, the path inside it, and the lines, read off the address.
// The branch is one segment: a branch with a slash in its name ("release/2")
// leaves part of itself at the front of the path.
function forgeParts(url: URL): { repository: string; rest: string; lines: string } | null {
  const segments = url.pathname.split("/").filter(Boolean).map(decode)
  const host = url.hostname.replace(/^www\./, "")
  const repositoryOf = (owner: string, name: string) => `${owner}/${name.replace(/\.git$/i, "")}`

  // GitLab, on gitlab.com or on a server of its own: /group/sub/name/-/blob/ref/path.
  const dash = segments.indexOf("-")
  if (dash >= 2) {
    const repository = segments.slice(0, dash).join("/")
    const [view, , ...path] = segments.slice(dash + 1)
    if (FILE_VIEWS.has(view)) {
      const match = GITLAB_LINES.exec(url.hash)
      return { repository, rest: path.join("/"), lines: lines(match?.[1], match?.[2]) }
    }
    return { repository, rest: segments.slice(dash + 1).join("/"), lines: "" }
  }
  if (segments.length < 2) return null
  const [owner, name, view, ...after] = segments

  if (host === "github.com") {
    if (!FILE_VIEWS.has(view)) return { repository: repositoryOf(owner, name), rest: segments.slice(2).join("/"), lines: "" }
    const match = GITHUB_LINES.exec(url.hash)
    return { repository: repositoryOf(owner, name), rest: after.slice(1).join("/"), lines: lines(match?.[1], match?.[2]) }
  }
  if (host === "bitbucket.org") {
    if (view !== "src") return { repository: repositoryOf(owner, name), rest: segments.slice(2).join("/"), lines: "" }
    const match = BITBUCKET_LINES.exec(url.hash)
    return { repository: repositoryOf(owner, name), rest: after.slice(1).join("/"), lines: lines(match?.[1], match?.[2]) }
  }
  // Gitea and Forgejo (Codeberg among them): /owner/name/src/branch/ref/path.
  if (view === "src" && ["branch", "tag", "commit"].includes(after[0])) {
    const match = GITHUB_LINES.exec(url.hash)
    return { repository: repositoryOf(owner, name), rest: after.slice(2).join("/"), lines: lines(match?.[1], match?.[2]) }
  }
  if (host === "codeberg.org" || host === "gitlab.com")
    return { repository: repositoryOf(owner, name), rest: segments.slice(2).join("/"), lines: "" }
  return null
}

export function describeCodeUrl(address: string): CodeLabel {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return { label: address, repository: null }
  }
  const forge = forgeParts(url)
  if (forge) {
    const rest = forge.rest.replace(/\/+$/, "")
    return rest
      ? { label: `${rest}${forge.lines}`, repository: forge.repository }
      : { label: forge.repository, repository: null }
  }
  const path = decode(url.pathname).replace(/\/+$/, "")
  return { label: `${url.host}${path}`, repository: null }
}

// The same in one line, for a tooltip or a screen reader:
// "packages/react/src/index.ts:10-20 in facebook/react".
export function codeLinkText(address: string) {
  const { label, repository } = describeCodeUrl(address)
  return repository ? `${label} in ${repository}` : label
}
