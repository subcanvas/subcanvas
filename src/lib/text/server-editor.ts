import "server-only"

import {
  BlockNoteSchema,
  createBlockSpec,
  createInlineContentSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core"
import { ServerBlockNoteEditor } from "@blocknote/server-util"
import { withMultiColumn } from "@blocknote/xl-multi-column"

import {
  bookmarkConfig,
  calloutConfig,
  documentLinkConfig,
  equationConfig,
  inlineEquationConfig,
  mathML,
  parseBookmark,
  parseCallout,
  parseCalloutContent,
  parseEquation,
  parseInlineEquation,
  parseTableOfContents,
  tableOfContentsConfig,
} from "./custom-blocks"

// BlockNote, headless, for server code that reads and writes text
// documents. It runs on jsdom, so one is made and shared.
//
// The schema has to know every block the browser's editor can write, or a
// document that contains one cannot be read. The app's own blocks are
// defined once, in custom-blocks.ts; the browser draws them with React
// (components/editor/blocks), and here each is drawn as the HTML it exports,
// which is what Markdown is made from.

const documentLink = createBlockSpec(documentLinkConfig, {
  render: (block) => {
    const dom = document.createElement("p")
    dom.textContent = `[Subcanvas document ${block.props.docId}]`
    return { dom }
  },
})

const callout = createBlockSpec(calloutConfig, {
  parse: parseCallout,
  parseContent: ({ el, schema }) => parseCalloutContent(el, schema),
  render: (block) => {
    const dom = document.createElement("aside")
    dom.setAttribute("data-icon", block.props.icon)
    const contentDOM = document.createElement("p")
    dom.append(contentDOM)
    return { dom, contentDOM }
  },
  toExternalHTML: (block) => {
    const dom = document.createElement("aside")
    dom.setAttribute("data-icon", block.props.icon)
    const contentDOM = document.createElement("p")
    dom.append(contentDOM)
    return { dom, contentDOM, childrenDOM: dom }
  },
})

const equation = createBlockSpec(equationConfig, {
  parse: parseEquation,
  render: (block) => {
    const dom = document.createElement("div")
    dom.innerHTML = mathML(block.props.latex, true)
    return { dom }
  },
})

const bookmark = createBlockSpec(bookmarkConfig, {
  parse: parseBookmark,
  render: (block) => {
    // A link on its own line, which is what Markdown can say.
    const dom = document.createElement("p")
    const link = document.createElement("a")
    link.href = block.props.url
    link.textContent = block.props.title || block.props.url
    dom.append(link)
    return { dom }
  },
})

const tableOfContents = createBlockSpec(tableOfContentsConfig, {
  parse: parseTableOfContents,
  render: () => {
    const dom = document.createElement("p")
    dom.textContent = "[TOC]"
    return { dom }
  },
})

const inlineEquation = createInlineContentSpec(inlineEquationConfig, {
  parse: parseInlineEquation,
  render: (content) => {
    const dom = document.createElement("span")
    dom.innerHTML = mathML(content.props.latex, false)
    return { dom }
  },
})

const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      documentLink: documentLink(),
      callout: callout(),
      equation: equation(),
      bookmark: bookmark(),
      tableOfContents: tableOfContents(),
    },
    inlineContentSpecs: { ...defaultInlineContentSpecs, inlineEquation },
  })
)

export const serverEditor = ServerBlockNoteEditor.create({ schema })

export type ServerBlocks = Awaited<ReturnType<typeof serverEditor.tryParseMarkdownToBlocks>>
