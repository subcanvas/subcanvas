// Addresses. A project is /<workspace>/<project>, its short name made by the
// database from its title (migration readable_addresses). A whiteboard or
// page in it is /<workspace>/<project>/<title>-<code>: the code is a few
// characters of the document's id, unique in the project, and is all that
// finds it. The title is there for people, so renaming or moving a document
// never breaks a link to it. Members and visitors to a public project use
// the same addresses.
//
// Breadcrumbs follow the path the reader took, not where a document lives
// (R2.1 - R2.3). The path travels in the address as `via`: the codes of the
// documents passed through, outermost first, joined by dots.

const CODE = /^[0-9a-f]{8,32}$/
const MAX_DEPTH = 24

// A workspace's and a project's short names.
export type ProjectPath = { slug: string; project: string }
// What a document's address is made of.
export type DocumentAddress = { code: string; title: string }

export const projectHref = (project: ProjectPath) => `/${project.slug}/${project.project}`

// Lowercase letters, digits and single hyphens, as the database makes a
// project's short name.
export function slugify(text: string, max = 60) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "")
}

export function documentSegment(document: DocumentAddress) {
  const words = slugify(document.title)
  return words ? `${words}-${document.code}` : document.code
}

// The code at the end of a document's part of the address, or null when
// there is none.
export function codeFromSegment(segment: string) {
  const code = segment.slice(segment.lastIndexOf("-") + 1).toLowerCase()
  return CODE.test(code) ? code : null
}

export function parseVia(param: string | string[] | null | undefined) {
  const raw = Array.isArray(param) ? param[0] : param
  if (!raw) return []
  return raw.split(".").filter((code) => CODE.test(code)).slice(-MAX_DEPTH)
}

export function documentHref(project: ProjectPath, document: DocumentAddress, via: string[] = []) {
  const base = `${projectHref(project)}/${documentSegment(document)}`
  // Revisiting a document already on the path goes back to it, so
  // references that form a loop do not grow the trail forever.
  const loop = via.indexOf(document.code)
  const trail = (loop === -1 ? via : via.slice(0, loop)).slice(-MAX_DEPTH)
  return trail.length ? `${base}?via=${trail.join(".")}` : base
}

// An address by id, for where only the id is at hand: links saved inside a
// document's content, and documents made a moment ago. It leads to the
// readable address.
export function documentPermalink(project: ProjectPath, documentId: string) {
  return `${projectHref(project)}/d/${documentId}`
}
