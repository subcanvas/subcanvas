import "server-only"

import { BlockNoteSchema, createBlockSpec, defaultBlockSpecs } from "@blocknote/core"
import { ServerBlockNoteEditor } from "@blocknote/server-util"

// BlockNote, headless, for server code that reads and writes text
// documents. It runs on jsdom, so one is made and shared.
//
// The schema has to know every block the browser's editor can write, or a
// document that contains one cannot be read. `documentLink` is the app's
// own block (components/editor/document-link-block.tsx): the same name and
// props here, with a rendering that only has to make sense as Markdown.
const documentLink = createBlockSpec(
  { type: "documentLink", propSchema: { docId: { default: "" } }, content: "none" },
  {
    render: (block) => {
      const dom = document.createElement("p")
      dom.textContent = `[Subcanvas document ${block.props.docId}]`
      return { dom }
    },
  }
)

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, documentLink: documentLink() },
})

export const serverEditor = ServerBlockNoteEditor.create({ schema })

export type ServerBlocks = Awaited<ReturnType<typeof serverEditor.tryParseMarkdownToBlocks>>
