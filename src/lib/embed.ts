import { publicProjectPath } from "./public-route"

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// What "Copy embed" copies: a whiteboard in a public project as a picture
// that links to the real thing. HTML, because it has to work inside
// Markdown on GitHub, which allows `<picture>` and so lets the diagram
// follow the reader's light or dark theme (docs/ROADMAP.md, section 4).
export function embedSnippet({
  origin,
  projectId,
  docId,
  title,
}: {
  origin: string
  projectId: string
  docId: string
  title: string
}) {
  const page = `${origin}${publicProjectPath(projectId)}/d/${docId}`
  const alt = escapeAttribute(`${title || "Untitled"}, a Subcanvas diagram`)
  return [
    `<a href="${page}">`,
    `  <picture>`,
    `    <source media="(prefers-color-scheme: dark)" srcset="${page}/embed.svg?theme=dark">`,
    `    <img alt="${alt}" src="${page}/embed.svg">`,
    `  </picture>`,
    `</a>`,
  ].join("\n")
}
