// What the sidebar remembers between visits, in cookies. They live here, not
// in the sidebar components, because the server reads them too, and a server
// component that imports a value from a "use client" file gets a reference,
// not the value.

// Whether the whole sidebar is collapsed to its rail.
export const SIDEBAR_COOKIE_NAME = "sidebar_state"

// Which workspace sections are closed, as their slugs. Open is the default, so
// only the closed ones are written down, and a new workspace starts open.
export const SIDEBAR_SECTIONS_COOKIE_NAME = "sidebar_sections_closed"
export const SIDEBAR_SECTIONS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// How many projects a section lists before it offers "Show all", which goes
// to the workspace's Projects page.
export const SIDEBAR_SECTION_PROJECT_LIMIT = 20

// A slug is lowercase letters, digits and hyphens, so a comma separates them.
export function readClosedSections(value: string | undefined): string[] {
  if (!value) return []
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // Not something this app wrote: forget it rather than fail the page.
    return []
  }
  return decoded.split(",").filter((slug) => /^[a-z0-9-]+$/.test(slug))
}

export function writeClosedSections(slugs: Iterable<string>): string {
  return encodeURIComponent([...slugs].join(","))
}
