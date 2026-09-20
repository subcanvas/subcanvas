import { baseName, withoutExtension } from "./paths"

// One Markdown file, read as a note: what it is called and what its body is.

const MAX_TITLE_LENGTH = 200

// Notion ends every exported file and folder name with the page's id: a
// space and 32 hex digits. Databases also come as "Name <id>_all.csv".
const NOTION_ID = /\s[0-9a-f]{32}(?=(_all)?$)/i

export function cleanName(name: string) {
  return name.replace(NOTION_ID, "").trim() || name
}

// The name a file gives its document when the text does not say.
export function titleFromPath(path: string) {
  return cleanName(withoutExtension(baseName(path))).slice(0, MAX_TITLE_LENGTH)
}

// Editors on Windows add a byte-order mark and CRLF line endings. The
// converter reads the first as text, which hides a heading on line one.
export function normalizeText(text: string) {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
}

const FRONT_MATTER = /^---\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/

// Only the title is read from front matter, so this does not need a YAML
// parser: a `title:` line at the top level, quoted or not.
function frontMatterTitle(yaml: string) {
  const match = /^title:[ \t]*(.+?)[ \t]*$/m.exec(yaml)
  if (!match) return null
  const value = match[1].replace(/^(["'])(.*)\1$/, "$2").trim()
  // A block scalar or a nested value is not a title on one line.
  return value && !/^[|>[{]/.test(value) ? value : null
}

// `# Title`, or `Title` underlined with `===`, as the first thing in the note.
const FIRST_HEADING = /^\s*(?:# +(.+?)(?: +#+)?|([^\n#>|`-][^\n]*)\n=+)[ \t]*(?:\n|$)/

function plain(inline: string) {
  return inline
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|[*_`~])/g, "")
    .trim()
}

// The title and the body of a note. The title is the `# heading` the note
// opens with, else front matter's `title`, else the file's name. Front
// matter is metadata and is left out of the body. So is an opening heading:
// the document shows its title above the text, and Notion, which starts
// every export with one, would have every page say its name twice.
export function readMarkdownFile(path: string, text: string): { title: string; body: string } {
  const normalized = normalizeText(text)
  const frontMatter = FRONT_MATTER.exec(normalized)
  const content = frontMatter ? normalized.slice(frontMatter[0].length) : normalized

  const heading = FIRST_HEADING.exec(content)
  const headingTitle = heading ? plain(heading[1] ?? heading[2]) : ""
  if (headingTitle)
    return {
      title: headingTitle.slice(0, MAX_TITLE_LENGTH),
      body: content.slice(heading![0].length).replace(/^\n+/, ""),
    }

  const title = (frontMatter && frontMatterTitle(frontMatter[1])) || titleFromPath(path)
  return { title: title.slice(0, MAX_TITLE_LENGTH), body: content.replace(/^\n+/, "") }
}
