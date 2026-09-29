import { titleFromPath } from "./markdown-file"
import { isNotionIndex, isNotionPage, normalizeNotionPage } from "./notion-html"

// One HTML file, read as a note: what it is called and what its body is.
// Notion's HTML export is the reason this exists (lib/import/notion-html.ts
// rewrites its markup into the forms the editor reads); any other page is
// taken as its <body>. Either way, what is kept is only what the editor can
// hold: the elements and attributes below. Scripts, styles, frames, forms and
// event handlers never leave this file.
//
// This runs wherever a DOM does: in the browser, and in tests under jsdom.

const MAX_TITLE_LENGTH = 200

// Elements whose content is not the note's.
const DROP = "script, style, link, meta, title, head, template, iframe, frame, object, embed, form, button, select, textarea, noscript, svg, canvas"

// Attributes the editor reads, by element; `data-*` ones on any element.
const KEEP: Record<string, string[]> = {
  a: ["href"],
  img: ["src", "alt"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  ol: ["start"],
  input: ["type", "checked"],
  code: ["class"],
  details: ["open"],
}
const DATA = new Set([
  "data-icon",
  "data-text-color",
  "data-background-color",
  "data-equation",
  "data-inline-equation",
  "data-bookmark",
  "data-url",
  "data-title",
  "data-description",
  "data-table-of-contents",
  "data-node-type",
  "data-width",
  "data-content-type",
  "data-doc-id",
  "data-language",
  // Marks a link that is a page's own, until links are rewritten (links.ts).
  "data-page-link",
])

// A colour in text is a span's CSS colour, which is how BlockNote reads it,
// and only BlockNote's own colours are kept.
const TEXT_COLOR = /^\s*(color|background-color):\s*(gray|brown|red|orange|yellow|green|blue|purple|pink)\s*;?\s*$/

// Keeps what the editor can use and nothing else, in place.
export function cleanHtml(root: Element) {
  for (const element of Array.from(root.querySelectorAll(DROP))) element.remove()
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    const tag = element.tagName.toLowerCase()
    const allowed = KEEP[tag] ?? []
    for (const { name, value } of Array.from(element.attributes)) {
      if (DATA.has(name) || allowed.includes(name)) continue
      if (name === "style" && tag === "span" && TEXT_COLOR.test(value)) continue
      element.removeAttribute(name)
    }
    // A checkbox is the only input a note has.
    if (tag === "input" && element.getAttribute("type") !== "checkbox") element.remove()
    // Only code's language survives from its classes.
    if (tag === "code") {
      const language = /(?:^|\s)language-([\w+#-]+)/.exec(element.getAttribute("class") ?? "")?.[1]
      if (language) element.setAttribute("class", `language-${language}`)
      else element.removeAttribute("class")
    }
  }
  // Links and images go only to the web, to a page of the import, or nowhere.
  for (const element of Array.from(root.querySelectorAll("[href], [src]"))) {
    for (const name of ["href", "src"]) {
      const value = element.getAttribute(name)
      if (value !== null && /^\s*(javascript|vbscript|data|file):/i.test(value)) element.removeAttribute(name)
    }
  }
}

export type HtmlNote = { title: string; root: HTMLElement; tableLeftOut: boolean }

// Null for Notion's list of the pages in an export, which is not a note.
export function readHtmlFile(path: string, text: string): HtmlNote | null {
  const doc = new DOMParser().parseFromString(text, "text/html")
  if (isNotionIndex(doc)) return null
  if (isNotionPage(doc)) {
    const { title, root, tableLeftOut } = normalizeNotionPage(doc)
    cleanHtml(root)
    return { title: (title || titleFromPath(path)).slice(0, MAX_TITLE_LENGTH), root, tableLeftOut }
  }

  const root = doc.createElement("div")
  root.append(...Array.from(doc.body.childNodes))
  // A page that opens with its own title says it once, as the document's.
  const first = root.querySelector("h1")
  const opening = first && !first.previousElementSibling && first.parentElement === root ? first : null
  const title = opening?.textContent?.trim() || doc.title.trim() || titleFromPath(path)
  opening?.remove()
  cleanHtml(root)
  return { title: title.slice(0, MAX_TITLE_LENGTH), root, tableLeftOut: false }
}
