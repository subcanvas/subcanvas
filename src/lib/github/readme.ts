import { parentPath } from "./paths"
import type { Repository } from "./provider"

// The parts of handling a README that are plain text work. Turning Markdown
// into a document is in readme-document.ts.

const SUMMARY_LENGTH = 160

// YAML front matter is metadata for a site generator, not something to read.
export function stripFrontMatter(markdown: string) {
  return markdown.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|__|[*_`~])/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// The first paragraph of prose, as one line for a node's description. What
// usually comes first in a README is not prose: a title, a logo, a row of
// badges. Those are passed over.
export function firstParagraph(markdown: string) {
  const blocks = stripFrontMatter(markdown)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n\s*\r?\n/)

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/)
    // Headings, tables, quotes, lists, rules, and "Title\n=====".
    if (/^(#{1,6}\s|\||>|[-*+]\s|\d+[.)]\s|[-*_=]{3,}\s*$)/.test(lines[0])) continue
    if (lines.length > 1 && /^(=+|-+)\s*$/.test(lines[1])) continue
    const text = plainText(block)
    if (text.length < 3 || !/\p{L}/u.test(text)) continue

    if (text.length <= SUMMARY_LENGTH) return text
    const cut = text.slice(0, SUMMARY_LENGTH)
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), SUMMARY_LENGTH / 2)).replace(/[\s.,;:]+$/, "")}…`
  }
  return ""
}

// A README's links and images are written relative to its own folder, which
// means nothing once the text lives here. They are pointed back at GitHub,
// at the commit that was imported: images at the raw file so they render,
// links at the page a person would want to land on.
export function resolveReadmeUrl(
  url: string,
  kind: "link" | "image",
  repository: Repository,
  readmePath: string
) {
  const trimmed = url.trim()
  // Already absolute (any scheme, or //host), or a heading on the same page.
  if (!trimmed || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed)) return trimmed

  const [, path = "", suffix = ""] = /^([^?#]*)(.*)$/.exec(trimmed) ?? []
  const segments = path.startsWith("/") ? [] : parentPath(readmePath).split("/").filter(Boolean)
  for (const segment of path.split("/")) {
    if (segment === "..") segments.pop()
    else if (segment && segment !== ".") segments.push(segment)
  }

  const target = segments.join("/")
  const { repository: name, commit } = repository
  if (kind === "image") return `https://raw.githubusercontent.com/${name}/${commit}/${target}${suffix}`
  // A path with no extension is taken for a folder.
  const view = !target || !/\.[^/.]+$/.test(target) ? "tree" : "blob"
  return `https://github.com/${name}/${view}/${commit}${target ? `/${target}` : ""}${suffix}`
}
