import { baseName, kindOf, resolveRelative, withoutExtension } from "./paths"

// Notes link to each other by file: `[text](./other.md)` in Markdown,
// `[[Other]]` in Obsidian. Once they are documents those paths mean
// nothing, so each link is pointed at the document its file became. This
// works on the Markdown text, before it is converted, and leaves code alone.

export type LinkTargets = {
  // The address of the document a path in the import became, if it did.
  byPath: (path: string) => string | null
  // The same for a note named the way Obsidian names them: by file name,
  // with or without folders in front, wherever the note is.
  byName: (name: string, fromPath: string) => string | null
}

export type Rewritten = {
  markdown: string
  // Images kept in the import's own files, which are not brought in.
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
        if (isElsewhere(unwrap(address))) return whole
        localImages++
        return alt || withoutExtension(baseName(pathOf(unwrap(address))))
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
        if (embed && kindOf(name) === "image") {
          localImages++
          return alias && !/^\d+(x\d+)?$/.test(alias) ? alias : withoutExtension(baseName(name))
        }
        const href = name ? targets.byName(name, fromPath) : null
        // A link to a note that was not imported stays as it was written.
        return href ? `[${linkText(alias || target)}](${href})` : whole
      })
      .replace(HIGHLIGHT, "$1")
  )

  return { markdown: rewritten, localImages, unlinked }
}
