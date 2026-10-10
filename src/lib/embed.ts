import { publicProjectPath } from "./public-route"

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// What "Copy embed" copies: a whiteboard in a public project as a picture
// that links to the real thing. HTML, because it has to work inside
// Markdown on GitHub, which allows `<picture>` and so lets the diagram
// follow the reader's light or dark theme (docs/ROADMAP.md, section 4).
//
// The link is the whiteboard's readable address (`page`). The picture is
// addressed by ids, which never change, so a renamed whiteboard or project
// does not break a README: nobody reads that address.
export function embedSnippet({
  origin,
  page,
  projectId,
  docId,
  title,
}: {
  origin: string
  page: string
  projectId: string
  docId: string
  title: string
}) {
  const picture = `${origin}${publicProjectPath(projectId)}/d/${docId}/embed.svg`
  const alt = escapeAttribute(`${title || "Untitled"}, a Subcanvas diagram`)
  return [
    `<a href="${page}">`,
    `  <picture>`,
    `    <source media="(prefers-color-scheme: dark)" srcset="${picture}?theme=dark">`,
    `    <img alt="${alt}" src="${picture}">`,
    `  </picture>`,
    `</a>`,
  ].join("\n")
}
