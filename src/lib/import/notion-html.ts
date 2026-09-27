// Notion's HTML export, rewritten into the HTML the editor reads.
//
// Notion writes each page as a standalone HTML file: an <article class="page">
// with a <header> (icon, cover, title, description, and a database row's
// properties) and a <div class="page-body">. Its blocks are ordinary HTML
// with Notion's classes on them, and most need only a little moving round to
// become the blocks of a text document (lib/text/custom-blocks.ts):
//
//   figure.callout                  <aside data-icon data-background-color>
//   div.column-list > div.column    BlockNote's columnList > column
//   figure.equation                 <div data-equation="TeX">
//   span.notion-text-equation-token <span data-inline-equation="TeX">
//   a.bookmark, figure > div.source a web page's card, <figure data-bookmark>
//   figure.link-to-page             a link marked as the page's own, which
//                                   becomes the document's card (links.ts)
//   nav.table_of_contents           <nav data-table-of-contents>
//   ul.to-do-list                   list items with a checkbox
//   ul.toggle > li > details        the <details> BlockNote reads as a toggle
//   block-color-*, highlight-*      BlockNote's colours
//   table.collection-content        a database's rows, as a plain table
//
// What cannot be carried is left as its words: a person or a date mentioned
// in the text, a file that was not imported.
//
// Notion has changed this markup over the years, and exports of every age
// are still around, so each rule reads each form seen in real exports:
// 2024's (TeX in KaTeX's MathML, <figure class="callout">, <ul class="toggle">,
// a div for a checkbox), late 2025's (every block wrapped in a
// <div style="display:contents">), and 2026's (TeX only in
// data-notion-equation, <aside data-notion-callout>, a bare
// <details class="toggle">, a real checkbox, data-notion-code-syntax).

import { MAX_CSV_COLUMNS, MAX_CSV_ROWS } from "./limits"

const COLORS = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"])

export function isNotionPage(doc: Document) {
  return !!doc.querySelector("article.page .page-body, article.page > header .page-title, div.page-body")
}

// The index.html at the root of a workspace export: a list of every page,
// with the workspace's id and name. It is Notion's, not a page of notes.
export function isNotionIndex(doc: Document) {
  return !isNotionPage(doc) && !!doc.querySelector('ul[id^="id::"]')
}

// Notion's colour names are BlockNote's, but for green, which it calls teal.
function colorOf(name: string | undefined) {
  if (!name) return null
  const color = name === "teal" ? "green" : name
  return COLORS.has(color) ? color : null
}

// `block-color-red` and `block-color-red_background` on a block, or
// `highlight-…` on a <mark>.
function colorsOf(element: Element, prefix: "block-color-" | "highlight-") {
  let text: string | null = null
  let background: string | null = null
  for (const name of Array.from(element.classList)) {
    if (!name.startsWith(prefix)) continue
    const value = name.slice(prefix.length)
    if (value.endsWith("_background")) background = colorOf(value.slice(0, -"_background".length))
    else text = colorOf(value)
  }
  return { text, background }
}

// The TeX of an equation: in 2026, an attribute of its own; before, only in
// the MathML KaTeX drew.
const texOf = (element: Element, attribute: string) =>
  element.getAttribute(attribute) ??
  element.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ??
  null

// A toggle heading's level, in 2024, was only the size of its summary.
const TOGGLE_HEADING_SIZES: Record<string, number> = { "1.875em": 1, "1.5em": 2, "1.25em": 3, "1.125em": 4 }

function rename(element: Element, tag: string) {
  const replacement = element.ownerDocument.createElement(tag)
  replacement.append(...Array.from(element.childNodes))
  element.replaceWith(replacement)
  return replacement
}

function unwrap(element: Element) {
  element.replaceWith(...Array.from(element.childNodes))
}

// Notion's names for code languages, as the code block knows them.
const LANGUAGES: Record<string, string> = {
  "plain text": "text",
  "c++": "cpp",
  "c#": "csharp",
  "f#": "fsharp",
  "objective-c": "objective-c",
  "visual basic": "vb",
  "vb.net": "vb",
  shell: "shellscript",
  bash: "bash",
  "java/c/c++/c#": "java",
  "markup": "html",
  "mermaid": "mermaid",
}
const languageOf = (name: string) => {
  const lower = name.trim().toLowerCase()
  return LANGUAGES[lower] ?? lower.replace(/\s+/g, "")
}

// A database row's properties, from the page's header, as a table of two
// columns: what each property is called, and its value as text.
function propertiesTable(doc: Document, header: Element | null) {
  const rows = Array.from(header?.querySelectorAll("table.properties tr") ?? [])
  const cells = rows
    .map((row) => [row.querySelector("th"), row.querySelector("td")] as const)
    .filter(([name, value]) => name?.textContent?.trim() && value?.textContent?.trim())
  if (!cells.length) return null
  const table = doc.createElement("table")
  for (const [name, value] of cells) {
    const row = table.insertRow()
    row.insertCell().textContent = name!.textContent!.trim()
    const cell = row.insertCell()
    // Select and multi-select values are separate spans; people and files too.
    const parts = Array.from(value!.querySelectorAll(".selected-value, .user, a"))
    cell.textContent = parts.length ? parts.map((part) => part.textContent?.trim()).filter(Boolean).join(", ") : value!.textContent!.trim()
  }
  return table
}

// A database's rows, from its own page, as a plain table of text in which
// each row's title still links to the row's page. One larger than a page
// should hold is left out: its rows are imported as documents all the same.
function databaseTable(table: Element) {
  const doc = table.ownerDocument
  const header = Array.from(table.querySelectorAll("thead th")).map((cell) => cell.textContent?.trim() ?? "")
  const rows = Array.from(table.querySelectorAll("tbody tr"))
  if (rows.length > MAX_CSV_ROWS || header.length > MAX_CSV_COLUMNS) return null
  const plain = doc.createElement("table")
  if (header.length) {
    const head = plain.createTHead().insertRow()
    for (const name of header) head.appendChild(doc.createElement("th")).textContent = name
  }
  const body = plain.createTBody()
  for (const row of rows) {
    const out = body.insertRow()
    for (const cell of Array.from(row.querySelectorAll("td"))) {
      const target = out.insertCell()
      const link = cell.querySelector("a[href]")
      if (link && cell.classList.contains("cell-title")) {
        const a = doc.createElement("a")
        a.setAttribute("href", link.getAttribute("href")!)
        a.textContent = cell.textContent?.trim() ?? ""
        target.append(a)
      } else {
        const parts = Array.from(cell.querySelectorAll(".selected-value, .user"))
        target.textContent = parts.length ? parts.map((part) => part.textContent?.trim()).join(", ") : (cell.textContent?.trim() ?? "")
      }
    }
  }
  return plain
}

export type NotionPage = { title: string; root: HTMLElement; tableLeftOut: boolean }

export function normalizeNotionPage(doc: Document): NotionPage {
  const article = doc.querySelector("article.page") ?? doc.body
  const header = article.querySelector(":scope > header")
  const title = header?.querySelector(".page-title")?.textContent?.trim() || doc.title.trim()

  const root = doc.createElement("div")
  const description = header?.querySelector(".page-description")
  if (description?.textContent?.trim()) root.append(rename(description, "p"))
  const properties = propertiesTable(doc, header)
  if (properties) root.append(properties)
  const body = article.querySelector(".page-body")
  if (body) root.append(...Array.from(body.childNodes))
  else {
    header?.remove()
    root.append(...Array.from(article.childNodes))
  }

  // Late 2025 wrapped every block in a div that draws nothing.
  for (const wrapper of Array.from(root.querySelectorAll("div[style*='display:contents']"))) unwrap(wrapper)

  let tableLeftOut = false
  for (const table of Array.from(root.querySelectorAll("table.collection-content"))) {
    const plain = databaseTable(table)
    // The database's own heading, when it sits in a page, and the wrappers
    // round the table.
    const holder = table.parentElement?.matches("div.collection-content, div.collection-content-wrapper") ? table.parentElement : null
    const title = holder?.querySelector(".collection-title")?.textContent?.trim()
    const replacement: Element[] = []
    if (title) {
      const heading = doc.createElement("h3")
      heading.textContent = title
      replacement.push(heading)
    }
    if (plain) replacement.push(plain)
    else tableLeftOut = true
    ;(holder ?? table).replaceWith(...replacement)
  }

  // Maths first, while KaTeX's markup is still whole.
  for (const figure of Array.from(root.querySelectorAll("figure.equation"))) {
    const div = doc.createElement("div")
    div.setAttribute("data-equation", texOf(figure, "data-notion-equation") ?? figure.textContent?.trim() ?? "")
    figure.replaceWith(div)
  }
  for (const token of Array.from(root.querySelectorAll(".notion-text-equation-token"))) {
    const span = doc.createElement("span")
    span.setAttribute("data-inline-equation", texOf(token, "data-notion-inline-equation") ?? token.textContent?.trim() ?? "")
    token.replaceWith(span)
  }

  // Callouts: an icon, then the content. The icon is an emoji, a picture
  // (which there is nowhere to put, so the callout has none), or absent.
  for (const callout of Array.from(root.querySelectorAll("figure.callout, aside.callout, aside[data-notion-callout]")).reverse()) {
    const aside = doc.createElement("aside")
    const icon = callout.querySelector(":scope > div:first-child .icon")
    const emoji =
      callout.getAttribute("data-notion-callout-icon") ??
      icon?.getAttribute("data-emoji") ??
      (icon && icon.tagName !== "IMG" ? icon.textContent?.trim() : "") ??
      ""
    aside.setAttribute("data-icon", emoji)
    const { text, background } = colorsOf(callout, "block-color-")
    if (background) aside.setAttribute("data-background-color", background)
    if (text) aside.setAttribute("data-text-color", text)
    const body = Array.from(callout.children).find((child) => /width:\s*100%/.test(child.getAttribute("style") ?? ""))
    const content = body ?? callout
    if (!body) icon?.closest("div")?.remove()
    aside.append(...Array.from(content.childNodes))
    callout.replaceWith(aside)
  }

  // Columns.
  for (const list of Array.from(root.querySelectorAll("div.column-list"))) {
    const columns = Array.from(list.querySelectorAll(":scope > div.column"))
    if (columns.length < 2) {
      for (const column of columns) unwrap(column)
      unwrap(list)
      continue
    }
    list.setAttribute("data-node-type", "columnList")
    for (const column of columns) {
      column.setAttribute("data-node-type", "column")
      const ratio = column.getAttribute("data-notion-column-ratio")
      const width = /width:\s*([\d.]+)%/.exec(column.getAttribute("style") ?? "")?.[1]
      if (ratio) column.setAttribute("data-width", ratio)
      else if (width) column.setAttribute("data-width", String(Math.round(Number(width) * 100) / 10000))
      // A column cannot be empty.
      if (!column.children.length) column.append(doc.createElement("p"))
    }
  }

  // Bookmarks, and embeds of web pages, as cards.
  for (const link of Array.from(root.querySelectorAll("a.bookmark"))) {
    const figure = doc.createElement("figure")
    figure.setAttribute("data-bookmark", "")
    figure.setAttribute("data-url", link.getAttribute("href") ?? "")
    figure.setAttribute("data-title", link.querySelector(".bookmark-title")?.textContent?.trim() ?? "")
    figure.setAttribute("data-description", link.querySelector(".bookmark-description")?.textContent?.trim() ?? "")
    ;(link.closest("figure") ?? link).replaceWith(figure)
  }
  for (const source of Array.from(root.querySelectorAll("figure > div.source"))) {
    const link = source.querySelector("a[href]")
    // Late 2025 sometimes wrote a web page's address as bare text.
    const href = link?.getAttribute("href") ?? (/^https?:\/\/\S+$/.test(source.textContent?.trim() ?? "") ? source.textContent!.trim() : "")
    const figure = source.parentElement!
    if (/^https?:\/\//i.test(href)) {
      const card = doc.createElement("figure")
      card.setAttribute("data-bookmark", "")
      card.setAttribute("data-url", href)
      const words = link?.textContent?.trim() ?? ""
      if (words && words !== href) card.setAttribute("data-title", words)
      figure.replaceWith(card)
    } else {
      // A file of the export (a PDF, say): its name, as a link that the
      // import points at nothing and leaves as words.
      const line = doc.createElement("p")
      if (link) line.append(link)
      figure.replaceWith(line)
    }
  }

  // A link to another page, and each subpage where it sits in its parent.
  for (const figure of Array.from(root.querySelectorAll("figure.link-to-page"))) {
    const link = figure.querySelector("a[href]")
    const line = doc.createElement("p")
    if (link) {
      link.querySelector(".icon")?.remove()
      line.setAttribute("data-page-link", "")
      line.append(link)
    }
    figure.replaceWith(line)
  }

  for (const nav of Array.from(root.querySelectorAll("nav.table_of_contents"))) {
    const toc = doc.createElement("nav")
    toc.setAttribute("data-table-of-contents", "")
    nav.replaceWith(toc)
  }
  for (const nav of Array.from(root.querySelectorAll("nav.breadcrumb, .breadcrumb"))) nav.remove()

  // To-dos: Notion draws the box as a div and the text in a span.
  for (const item of Array.from(root.querySelectorAll("ul.to-do-list > li"))) {
    const box = item.querySelector(":scope > .checkbox")
    const checkbox = doc.createElement("input")
    checkbox.setAttribute("type", "checkbox")
    if (box?.classList.contains("checkbox-on")) checkbox.setAttribute("checked", "")
    box?.remove()
    const text = item.querySelector(":scope > span[class^='to-do-children']")
    const line = doc.createElement("p")
    if (text) line.append(...Array.from(text.childNodes))
    text?.remove()
    item.prepend(checkbox, line)
  }
  // Toggles: the list round a <details> goes (2026 writes none), and a
  // toggle heading's summary holds its heading, which BlockNote reads as it
  // is. In 2024 the heading was only a larger summary.
  for (const list of Array.from(root.querySelectorAll("ul.toggle"))) {
    const details = Array.from(list.querySelectorAll(":scope > li > details"))
    if (details.length) list.replaceWith(...details)
  }
  for (const summary of Array.from(root.querySelectorAll("details > summary[style*='font-size']"))) {
    if (summary.querySelector("h1, h2, h3, h4, h5, h6")) continue
    const size = /font-size:\s*([\d.]+em)/.exec(summary.getAttribute("style") ?? "")?.[1]
    const level = size ? TOGGLE_HEADING_SIZES[size] : undefined
    if (!level) continue
    const heading = doc.createElement(`h${level}`)
    heading.append(...Array.from(summary.childNodes))
    summary.append(heading)
  }
  // Nested blocks: what Notion indents sits in a div inside the item.
  for (const indented of Array.from(root.querySelectorAll("div.indented"))) unwrap(indented)

  // Code: Notion's language names, as the code block knows them.
  for (const code of Array.from(root.querySelectorAll("pre > code"))) {
    const language =
      code.getAttribute("data-notion-code-syntax") ??
      code.parentElement?.getAttribute("data-notion-code-syntax") ??
      /language-(.+)/.exec(code.getAttribute("class") ?? "")?.[1]
    if (language) code.setAttribute("data-language", languageOf(language))
  }

  // Colours: on blocks, as the attributes BlockNote reads; in text, as the
  // CSS colour a span carries, which is how BlockNote reads a text colour.
  for (const block of Array.from(root.querySelectorAll("[class*='block-color-']"))) {
    const { text, background } = colorsOf(block, "block-color-")
    if (text) block.setAttribute("data-text-color", text)
    if (background) block.setAttribute("data-background-color", background)
  }
  for (const mark of Array.from(root.querySelectorAll("mark[class*='highlight-']"))) {
    const { text, background } = colorsOf(mark, "highlight-")
    const span = rename(mark, "span")
    if (text) span.setAttribute("style", `color: ${text}`)
    else if (background) span.setAttribute("style", `background-color: ${background}`)
  }
  // Underline is a bottom border in Notion's HTML.
  for (const span of Array.from(root.querySelectorAll("span[style*='border-bottom']"))) rename(span, "u")

  // A page mentioned in the text shows its icon, which is Notion's to draw.
  for (const icon of Array.from(root.querySelectorAll("a .icon"))) icon.remove()

  // People and dates mentioned in the text keep their words.
  for (const mention of Array.from(root.querySelectorAll("span.user, time"))) unwrap(mention)

  return { title, root, tableLeftOut }
}
