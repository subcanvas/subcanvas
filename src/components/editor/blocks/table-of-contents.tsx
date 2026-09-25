"use client"

import type { Block, BlockNoteEditor, BlockSchema, InlineContentSchema, StyleSchema } from "@blocknote/core"
import { createReactBlockSpec, useEditorChange } from "@blocknote/react"
import { useState } from "react"

import { parseTableOfContents, tableOfContentsConfig } from "@/lib/text/custom-blocks"

type Heading = { id: string; level: number; text: string }
type AnyBlock = Block<BlockSchema, InlineContentSchema, StyleSchema>
type AnyEditor = BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>

// Every heading in the document, in order, however deeply it is nested.
function headingsOf(blocks: AnyBlock[], into: Heading[] = []): Heading[] {
  for (const block of blocks) {
    if (block.type === "heading") {
      const content: unknown = block.content
      const text = Array.isArray(content)
        ? content.map((piece: { text?: string }) => piece.text ?? "").join("")
        : ""
      if (text.trim()) into.push({ id: block.id, level: Number(block.props.level) || 1, text })
    }
    headingsOf(block.children, into)
  }
  return into
}

function Contents({ editor }: { editor: AnyEditor }) {
  const [headings, setHeadings] = useState(() => headingsOf(editor.document))
  useEditorChange(() => setHeadings(headingsOf(editor.document)), editor)

  if (!headings.length)
    return (
      <p className="sc-toc-empty" contentEditable={false}>
        Add headings and they are listed here.
      </p>
    )
  const top = Math.min(...headings.map((heading) => heading.level))
  return (
    <nav aria-label="Table of contents" className="sc-toc" contentEditable={false}>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} style={{ paddingLeft: `${(heading.level - top) * 1.25}rem` }}>
            <a
              href={`#${heading.id}`}
              onClick={(event) => {
                event.preventDefault()
                const target = editor.domElement?.querySelector(`[data-id="${CSS.escape(heading.id)}"]`)
                target?.scrollIntoView({ behavior: "smooth", block: "start" })
                if (editor.isEditable) editor.setTextCursorPosition(heading.id, "start")
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export const createTableOfContents = createReactBlockSpec(tableOfContentsConfig, {
  parse: parseTableOfContents,
  render: ({ editor }) => <Contents editor={editor as unknown as AnyEditor} />,
  toExternalHTML: () => <p>[TOC]</p>,
})
