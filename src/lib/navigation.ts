// Breadcrumbs follow the path the reader took, not where a document lives
// (R2.1 - R2.3). The path travels in the URL as `via`: the ids of the
// documents passed through, outermost first, joined by dots.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DEPTH = 24

export type ProjectPath = { slug: string; projectId: string }

export function parseVia(param: string | string[] | null | undefined) {
  const raw = Array.isArray(param) ? param[0] : param
  if (!raw) return []
  return raw.split(".").filter((id) => UUID.test(id)).slice(-MAX_DEPTH)
}

export function documentHref(project: ProjectPath, documentId: string, via: string[] = []) {
  const base = `/${project.slug}/${project.projectId}/d/${documentId}`
  // Revisiting a document already on the path goes back to it, so
  // references that form a loop do not grow the trail forever.
  const loop = via.indexOf(documentId)
  const trail = (loop === -1 ? via : via.slice(0, loop)).slice(-MAX_DEPTH)
  return trail.length ? `${base}?via=${trail.join(".")}` : base
}
