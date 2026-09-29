import "server-only"

import { serverEditor, type ServerBlocks } from "./server-editor"

// Markdown in and out of text documents, for agents (the MCP server) and
// for imports. BlockNote converts plain Markdown itself; this adds the
// syntax for the app's own blocks (lib/text/custom-blocks.ts):
//
//   $$                      display maths, also `$$ x^2 $$` on one line
//   \frac{a}{b}
//   $$
//
//   Inline $e^{i\pi}$ maths
//
//   <aside data-icon="💡">  a callout, with Markdown inside it; Notion's
//                           Markdown export writes `<aside>💡 Text</aside>`
//   Text
//   </aside>
//
//   [TOC]                   a table of contents
//
// Each is rewritten to the HTML its block reads, which BlockNote's Markdown
// converter passes through untouched. Fenced code is never rewritten.

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const DISPLAY_MATH_ONE_LINE = /^ {0,3}\$\$(.+?)\$\$\s*$/
const DISPLAY_MATH_EDGE = /^ {0,3}\$\$\s*$/
const ASIDE_OPEN = /^ {0,3}(<aside\b[^>]*>)(.*)$/i
const ASIDE_CLOSE = /^(.*?)<\/aside>\s*$/i
const TOC = /^ {0,3}\[TOC\]\s*$/i

// `$x$`: the dollar signs hug the maths, and the closing one is not followed
// by a digit, so prices ("$5 and $10") stay text.
const INLINE_MATH = /(?<![\\$\w])\$(?=[^\s$])([^$\n]*?[^\s\\$])\$(?![\w$])/g
const CODE_SPAN = /(`+)[\s\S]*?\1/g

function inlineMath(line: string) {
  if (!line.includes("$")) return line
  let out = ""
  let last = 0
  // Code spans are copied as they are; only the text between them is read.
  for (const span of line.matchAll(CODE_SPAN)) {
    out += line.slice(last, span.index).replace(INLINE_MATH, replaceInline) + span[0]
    last = span.index! + span[0].length
  }
  return out + line.slice(last).replace(INLINE_MATH, replaceInline)
}

const replaceInline = (_: string, latex: string) => `<span data-inline-equation="${escapeAttribute(latex)}"></span>`
const equationBlock = (latex: string) => ["", `<div data-equation="${escapeAttribute(latex.trim())}"></div>`, ""]

export function prepareMarkdown(markdown: string): string {
  const lines = markdown.split("\n")
  const out: string[] = []
  let fence: string | null = null
  let math: string[] | null = null

  for (const line of lines) {
    if (fence !== null) {
      out.push(line)
      if (line.trim().startsWith(fence)) fence = null
      continue
    }
    if (math !== null) {
      if (DISPLAY_MATH_EDGE.test(line)) {
        out.push(...equationBlock(math.join("\n")))
        math = null
      } else math.push(line)
      continue
    }

    const opening = FENCE.exec(line)
    if (opening) {
      fence = opening[1]
      out.push(line)
      continue
    }
    if (DISPLAY_MATH_EDGE.test(line)) {
      math = []
      continue
    }
    const oneLine = DISPLAY_MATH_ONE_LINE.exec(line)
    if (oneLine) {
      out.push(...equationBlock(oneLine[1]))
      continue
    }
    if (TOC.test(line)) {
      out.push("", "<nav data-table-of-contents></nav>", "")
      continue
    }

    // A callout's tags each get a line of their own with blank lines around
    // them, so that what is between them is read as Markdown.
    const aside = ASIDE_OPEN.exec(line)
    if (aside) {
      out.push("", aside[1], "")
      const rest = aside[2]
      const closed = ASIDE_CLOSE.exec(rest)
      if (closed) out.push(inlineMath(closed[1]), "", "</aside>", "")
      else if (rest.trim()) out.push(inlineMath(rest))
      continue
    }
    const closing = ASIDE_CLOSE.exec(line)
    if (closing) {
      if (closing[1].trim()) out.push(inlineMath(closing[1]))
      out.push("", "</aside>", "")
      continue
    }

    out.push(inlineMath(line))
  }
  // Maths that is never closed is text after all.
  if (math !== null) out.push("$$", ...math)
  return out.join("\n")
}

export const parseMarkdown = (markdown: string) => serverEditor.tryParseMarkdownToBlocks(prepareMarkdown(markdown))

type AnyBlock = ServerBlocks[number]

// A block as Markdown. BlockNote writes most of them; a callout becomes the
// `<aside>` form above, which it has no Markdown of its own for.
export async function blockToMarkdown(block: AnyBlock): Promise<string> {
  if (block.type !== "callout") return (await serverEditor.blocksToMarkdownLossy([block])).trimEnd()
  const { icon, backgroundColor } = block.props as { icon: string; backgroundColor: string }
  const color = backgroundColor && backgroundColor !== "gray" ? ` data-background-color="${escapeAttribute(backgroundColor)}"` : ""
  const text = { ...block, type: "paragraph", props: {}, children: [] } as unknown as AnyBlock
  const inside = [await serverEditor.blocksToMarkdownLossy([text])]
  // Children in runs, so that a list stays one list; a callout inside a
  // callout is written on its own.
  let run: AnyBlock[] = []
  const flush = async () => {
    if (run.length) inside.push(await serverEditor.blocksToMarkdownLossy(run))
    run = []
  }
  for (const child of block.children as AnyBlock[]) {
    if (child.type !== "callout") run.push(child)
    else {
      await flush()
      inside.push(await blockToMarkdown(child))
    }
  }
  await flush()
  const body = inside.map((part) => part.trim()).filter(Boolean).join("\n\n")
  return `<aside data-icon="${escapeAttribute(icon)}"${color}>\n\n${body}\n\n</aside>`
}
