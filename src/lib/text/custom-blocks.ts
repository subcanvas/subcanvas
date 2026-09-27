import { defaultProps } from "@blocknote/core"
import katex from "katex"
import { DOMParser, Fragment, type Schema } from "prosemirror-model"

// The blocks a text document has beyond BlockNote's own: what each one is
// called, what it stores, and how it is read from HTML. The browser's editor
// (components/editor/blocks) and the server's (server-editor.ts) build their
// specs from these, so both read and write exactly the same documents.
//
// HTML is how everything arrives: pasted from another app, converted from
// Markdown (lib/text/markdown.ts turns `$$`, `$…$`, `<aside>` and `[TOC]`
// into the forms read here), or imported from a Notion export
// (lib/import/notion-html.ts rewrites Notion's markup into the same forms).

export const documentLinkConfig = {
  type: "documentLink",
  propSchema: { docId: { default: "" } },
  content: "none",
} as const

// A box with an emoji and a colour, like Notion's. Its first paragraph is
// its text; blocks nested under it are drawn inside the box.
export const calloutConfig = {
  type: "callout",
  propSchema: { ...defaultProps, icon: { default: "💡" } },
  content: "inline",
} as const

// Display maths, written in TeX and drawn by KaTeX.
export const equationConfig = {
  type: "equation",
  propSchema: { latex: { default: "" } },
  content: "none",
} as const

// Maths inside a line of text.
export const inlineEquationConfig = {
  type: "inlineEquation",
  propSchema: { latex: { default: "" } },
  content: "none",
} as const

// A link shown as a card: the page's title and description under its address.
export const bookmarkConfig = {
  type: "bookmark",
  propSchema: { url: { default: "" }, title: { default: "" }, description: { default: "" } },
  content: "none",
} as const

// The document's headings, kept current, each a link to its heading.
export const tableOfContentsConfig = {
  type: "tableOfContents",
  propSchema: {},
  content: "none",
} as const

// --- Colours ------------------------------------------------------------------

// BlockNote's colours, which are also Notion's (Notion's HTML says "teal"
// for green).
export const COLORS = ["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const

function colorAttribute(el: HTMLElement, name: "data-text-color" | "data-background-color") {
  const value = el.getAttribute(name)
  return value && (COLORS as readonly string[]).includes(value) ? value : undefined
}

// --- Maths --------------------------------------------------------------------

// KaTeX's MathML keeps the TeX it was drawn from, which is how a formula
// copied out of a page, KaTeX's or Notion's, comes back as TeX.
export function texOf(el: Element): string | null {
  const annotation = el.querySelector('annotation[encoding="application/x-tex"]')
  return annotation?.textContent?.trim() ?? null
}

// MathML for export: what BlockNote's Markdown writer turns into `$$…$$` and
// `$…$`, and what other editors read when the formula is pasted into them.
export function mathML(latex: string, displayMode: boolean) {
  return katex.renderToString(latex, { displayMode, output: "mathml", throwOnError: false })
}

export function parseEquation(el: HTMLElement): { latex: string } | undefined {
  if (el.hasAttribute("data-equation")) return { latex: el.getAttribute("data-equation") ?? "" }
  if (el.tagName === "MATH" && el.getAttribute("display") === "block") {
    const latex = texOf(el)
    return latex === null ? undefined : { latex }
  }
  // KaTeX's own output for display maths.
  if (el.classList.contains("katex-display")) {
    const latex = texOf(el)
    return latex === null ? undefined : { latex }
  }
  return undefined
}

export function parseInlineEquation(el: HTMLElement): { latex: string } | undefined {
  if (el.hasAttribute("data-inline-equation")) return { latex: el.getAttribute("data-inline-equation") ?? "" }
  if (el.tagName === "MATH" && el.getAttribute("display") !== "block") {
    const latex = texOf(el)
    return latex === null ? undefined : { latex }
  }
  if (el.classList.contains("katex") && !el.closest(".katex-display")) {
    const latex = texOf(el)
    return latex === null ? undefined : { latex }
  }
  return undefined
}

// --- Callouts -----------------------------------------------------------------

// An emoji at the very start of a callout's text, as Notion's Markdown
// export writes it: `<aside>💡 Text</aside>`.
const LEADING_EMOJI = /^\s*(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u

export function parseCallout(el: HTMLElement) {
  if (el.tagName !== "ASIDE") return undefined
  const icon = el.getAttribute("data-icon") ?? LEADING_EMOJI.exec(el.textContent ?? "")?.[1] ?? calloutConfig.propSchema.icon.default
  return {
    icon,
    backgroundColor: colorAttribute(el, "data-background-color") ?? "gray",
    textColor: colorAttribute(el, "data-text-color") ?? "default",
  }
}

const BLOCK_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "TABLE", "HR", "DETAILS",
  "FIGURE", "ASIDE", "DIV", "NAV", "IMG", "VIDEO", "AUDIO",
])

// A callout's first paragraph is its text, and the rest of what is inside
// it becomes blocks nested under it: the same shape BlockNote gives a
// toggle's `<details>`.
export function parseCalloutContent(el: HTMLElement, schema: Schema): Fragment {
  const parser = DOMParser.fromSchema(schema)
  const nodes = Array.from(el.childNodes).filter((node) => node.nodeType !== 3 || node.textContent?.trim())

  // Leading text and inline elements, or the first paragraph, are the text.
  const inline = document.createElement("p")
  let rest = nodes
  if (nodes[0] && nodes[0].nodeType === 1 && (nodes[0] as HTMLElement).tagName === "P") {
    inline.append(...Array.from(nodes[0].childNodes).map((node) => node.cloneNode(true)))
    rest = nodes.slice(1)
  } else {
    let index = 0
    while (index < nodes.length && !(nodes[index].nodeType === 1 && BLOCK_TAGS.has((nodes[index] as HTMLElement).tagName))) {
      inline.append(nodes[index].cloneNode(true))
      index++
    }
    rest = nodes.slice(index)
  }
  stripLeadingEmoji(inline, el.getAttribute("data-icon") === null)

  const text = parser.parse(inline, { topNode: schema.nodes.paragraph.create(), preserveWhitespace: true }).content
  const content = schema.nodes.callout.create({}, text).content
  if (!rest.length) return content

  const group = document.createElement("div")
  group.setAttribute("data-node-type", "blockGroup")
  group.append(...rest.map((node) => node.cloneNode(true)))
  const children = parser.parse(group, { topNode: schema.nodes.blockGroup.create() })
  return children.content.size ? content.addToEnd(children) : content
}

// The emoji Notion's Markdown puts in front of a callout's text is its icon,
// read by parseCallout; it is not text as well.
function stripLeadingEmoji(inline: HTMLElement, fromText: boolean) {
  if (!fromText) return
  const walker = document.createTreeWalker(inline, 4 /* NodeFilter.SHOW_TEXT */)
  let node = walker.nextNode()
  while (node && !node.textContent?.trim()) node = walker.nextNode()
  if (node?.textContent) node.textContent = node.textContent.replace(LEADING_EMOJI, "")
}

// --- Bookmarks and the table of contents --------------------------------------

export function parseBookmark(el: HTMLElement) {
  if (!el.hasAttribute("data-bookmark")) return undefined
  const url = el.getAttribute("data-url") ?? ""
  if (!/^https?:\/\//i.test(url)) return undefined
  return {
    url,
    title: el.getAttribute("data-title") ?? "",
    description: el.getAttribute("data-description") ?? "",
  }
}

export function parseTableOfContents(el: HTMLElement) {
  return el.tagName === "NAV" && el.hasAttribute("data-table-of-contents") ? {} : undefined
}

// Only web addresses are opened from a bookmark: never `javascript:` or a
// local file, whatever an imported page said.
export function safeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : null
}

export function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return url
  }
}
