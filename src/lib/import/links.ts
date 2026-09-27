import { baseName, kindOf, resolveRelative, withoutExtension } from "./paths"

// Notes link to each other by file: `[text](./other.md)` in Markdown,
// `[[Other]]` in Obsidian. Once they are documents those paths mean
// nothing, so each link is pointed at the document its file became. This
// works on the Markdown text, before it is converted, and leaves code alone.

export type LinkTargets = {
  // The address of the document a path in the import became, if it did.
  byPath: (path: string) => string | null
  // The same document's id, for a link drawn as the document's card.
  idByPath?: (path: string) => string | null
  // The same for a note named the way Obsidian names them: by file name,
  // with or without folders in front, wherever the note is.
  byName: (name: string, fromPath: string) => string | null
  // The path of a file that is not a note, such as an image, named the way
  // Obsidian names them: by file name alone, wherever it is.
  fileNamed: (name: string) => string | null
  // Where a picture among the import's files will be, once it is uploaded
  // with the document that shows it; null when it cannot be brought in.
  imageUrl?: (path: string) => string | null
}

export type Rewritten = {
  markdown: string
  // Images the notes show from the import's own files that cannot be brought
  // in: missing from the import, or of a kind this app does not keep.
  localImages: number
  // Links to files that are not part of the import, left as plain text.
  unlinked: number
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const INLINE_CODE = /(`+)(?!`)[^\n]*?[^`\n]\1(?!`)|(`+)(?!`)[^`\n]\2(?!`)/g

// Runs `change` over everything that is not code: not inside a fenced
// block, and not inside backticks.
function outsideCode(markdown: string, change: (prose: string) => string) {
  const out: string[] = []
  let prose: string[] = []
  let fence: string | null = null

  const flush = () => {
    if (!prose.length) return
    const text = prose.join("\n")
    let result = ""
    let last = 0
    for (const match of text.matchAll(INLINE_CODE)) {
      result += change(text.slice(last, match.index)) + match[0]
      last = match.index + match[0].length
    }
    out.push(result + change(text.slice(last)))
    prose = []
  }

  for (const line of markdown.split("\n")) {
    const marker = FENCE.exec(line)?.[1]
    if (fence) {
      out.push(line)
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker)
        fence = null
    } else if (marker) {
      flush()
      out.push(line)
      fence = marker
    } else prose.push(line)
  }
  flush()
  return out.join("\n")
}

// `[text](url "title")` and `![alt](url)`. The text may hold one level of
// brackets and the address one level of parentheses, or be in <angle
// brackets>, which is how an address with spaces is written.
const INLINE_LINK =
  /(!?)\[((?:[^[\]\\]|\\.|\[[^[\]]*\])*)\]\(\s*(<[^<>\n]*>|(?:[^()\s\\]|\\.|\([^()\s]*\))*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g
const IMAGE_ONLY = new RegExp(INLINE_LINK.source.replace("(!?)", "(!)"), "g")
const WIKI_LINK = /(!?)\[\[([^[\]\n]+?)\]\]/g
// `[label]: url "title"` on a line of its own. A footnote's label starts with ^.
const DEFINITION = /^ {0,3}\[([^\]\n^][^\]\n]*)\]:[ \t]*(<[^<>\n]*>|\S+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)\n]*\)))?[ \t]*(?:\n|$)/gm
// `[text][label]`, `[label][]`, and `[label]` alone.
const REFERENCE_USE = /(!?)\[((?:[^[\]\\]|\\.)+)\](?:\[([^[\]\n]*)\])?(?![[(:])/g
const CALLOUT = /^((?:[ \t]*>)+[ \t]*)\[!([\w-]+)\][+-]?[ \t]*(.*)$/gm
const HIGHLIGHT = /==(?!\s)([^=\n]+?)(?<!\s)==/g

const isElsewhere = (url: string) => /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url) && !/^data:/i.test(url)
const unwrap = (url: string) => (url.startsWith("<") ? url.slice(1, -1) : url).trim()
const pathOf = (url: string) => /^[^?#]*/.exec(url)![0]
const linkText = (text: string) => text.replace(/([[\]])/g, "\\$1")

const labelKey = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase()

export function rewriteLinks(markdown: string, fromPath: string, targets: LinkTargets): Rewritten {
  let localImages = 0
  let unlinked = 0

  // The converter does not know reference-style links, which READMEs are
  // full of: each use is written out in full, and the definitions dropped.
  const definitions = new Map<string, string>()
  for (const [, label, address] of markdown.matchAll(DEFINITION))
    if (!definitions.has(labelKey(label))) definitions.set(labelKey(label), unwrap(address))

  const documentAt = (url: string) => {
    const path = resolveRelative(fromPath, pathOf(url))
    return path ? targets.byPath(path) : null
  }

  // An image among the import's files: shown from where it will be, or, left
  // behind, replaced by the words that described it.
  const localImage = (path: string | null, alt: string, fallback: string) => {
    const url = path ? (targets.imageUrl?.(path) ?? null) : null
    if (url) return `![${alt}](${url})`
    localImages++
    return alt || withoutExtension(baseName(fallback))
  }

  const rewritten = outsideCode(markdown, (prose) =>
    prose
      .replace(DEFINITION, "")
      .replace(REFERENCE_USE, (whole, bang: string, text: string, label: string | undefined) => {
        const url = definitions.get(labelKey(label || text))
        if (url === undefined) return whole
        return `${bang}[${text}](${/[\s()]/.test(url) ? `<${url}>` : url})`
      })
      // An Obsidian callout is a quote whose first line names its kind.
      .replace(CALLOUT, (_, quote: string, kind: string, title: string) => {
        const name = title.trim() || kind[0].toUpperCase() + kind.slice(1).toLowerCase()
        return `${quote}**${name}**`
      })
      .replace(IMAGE_ONLY, (whole, _bang, alt: string, address: string) => {
        const url = unwrap(address)
        if (isElsewhere(url)) return whole
        const inline = /^data:/i.test(url)
        return localImage(inline ? null : resolveRelative(fromPath, pathOf(url)), alt, inline ? "image" : pathOf(url))
      })
      .replace(INLINE_LINK, (whole, bang: string, text: string, address: string) => {
        const url = unwrap(address)
        if (bang || !url || isElsewhere(url)) return whole
        const href = documentAt(url)
        if (href) return `[${text}](${href})`
        unlinked++
        return text
      })
      // Last, so that the links this writes are not read again as links to files.
      .replace(WIKI_LINK, (whole, embed: string, inner: string) => {
        const [target, alias] = inner.split("|").map((part) => part.trim())
        const name = target.replace(/#.*$/, "").trim()
        // After the bar of an embedded image comes its width, not a caption.
        if (embed && kindOf(name) === "image")
          return localImage(targets.fileNamed(name), alias && !/^\d+(x\d+)?$/.test(alias) ? alias : "", name)
        const href = name ? targets.byName(name, fromPath) : null
        // A link to a note that was not imported stays as it was written.
        return href ? `[${linkText(alias || target)}](${href})` : whole
      })
      .replace(HIGHLIGHT, "$1")
  )

  return { markdown: rewritten, localImages, unlinked }
}

// The same for a page read as HTML (lib/import/html-file.ts), in place: a
// link to a page of the import points at its document, and one to a page
// that was not imported becomes its words. A link marked as a page's own
// (Notion's "link to page", and each subpage in its parent) becomes the
// document's card, which is how a text document shows what it holds.
export function rewriteHtmlLinks(root: Element, fromPath: string, targets: LinkTargets): Omit<Rewritten, "markdown"> {
  let localImages = 0
  let unlinked = 0
  const doc = root.ownerDocument

  // Images first, so that the link Notion wraps round each one is not taken
  // for a link. Those among the import's files are uploaded with the page;
  // one that cannot be leaves the words that described it, on a line of
  // their own.
  for (const image of Array.from(root.querySelectorAll("img"))) {
    const src = image.getAttribute("src") ?? ""
    if (/^https?:\/\//i.test(src)) continue
    const path = src ? resolveRelative(fromPath, pathOf(src)) : null
    const url = path ? (targets.imageUrl?.(path) ?? null) : null
    const figure = image.closest("figure") ?? image
    if (url) {
      image.setAttribute("src", url)
      // The link Notion wraps round a picture goes to the file, not a page.
      const wrapper = image.parentElement?.tagName === "A" ? image.parentElement : null
      wrapper?.replaceWith(image)
      continue
    }
    localImages++
    // A caption says what the image shows, then its alt text, then its name.
    const words =
      figure.querySelector("figcaption")?.textContent?.trim() ||
      image.getAttribute("alt")?.trim() ||
      withoutExtension(baseName(pathOf(src))) ||
      "image"
    const line = doc.createElement("p")
    line.textContent = words
    figure.replaceWith(line)
  }
  for (const link of Array.from(root.querySelectorAll("a[href]"))) {
    const url = link.getAttribute("href")!.trim()
    if (!url || isElsewhere(url)) continue
    const path = resolveRelative(fromPath, pathOf(url))
    const holder = link.closest("[data-page-link]")
    const id = path && holder ? (targets.idByPath?.(path) ?? null) : null
    if (holder && id) {
      const card = doc.createElement("div")
      card.setAttribute("data-content-type", "documentLink")
      card.setAttribute("data-doc-id", id)
      holder.replaceWith(card)
      continue
    }
    const href = path ? targets.byPath(path) : null
    if (href) link.setAttribute("href", href)
    else {
      unlinked++
      link.replaceWith(...Array.from(link.childNodes))
    }
  }
  for (const holder of Array.from(root.querySelectorAll("[data-page-link]"))) holder.removeAttribute("data-page-link")

  return { localImages, unlinked }
}
