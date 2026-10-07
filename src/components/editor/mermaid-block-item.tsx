"use client"

import { SideMenuExtension } from "@blocknote/core/extensions"
import {
  BlockColorsItem,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useComponentsContext,
  useDictionary,
  useExtensionState,
} from "@blocknote/react"

// A Mermaid code block stays a code block: it is the diagram's source, it
// reads back out as the same Markdown, and it is what GitHub and every other
// Markdown reader show. Its block menu (the handle beside it) offers to draw
// it as a whiteboard too, which lands inside this page with a link under the
// code.

export type MermaidBlock = { id: string; text: string }

function codeOf(content: unknown) {
  return Array.isArray(content)
    ? content.map((piece) => (typeof piece?.text === "string" ? piece.text : "")).join("")
    : ""
}

function DrawItem({ onDraw }: { onDraw: (block: MermaidBlock) => void }) {
  const Components = useComponentsContext()!
  const block = useExtensionState(SideMenuExtension, { selector: (state) => state?.block })
  if (block?.type !== "codeBlock" || (block.props as { language?: string }).language !== "mermaid") return null
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => onDraw({ id: block.id, text: codeOf(block.content) })}
    >
      Draw as a whiteboard
    </Components.Generic.Menu.Item>
  )
}

function BlockMenu({ onDraw }: { onDraw?: (block: MermaidBlock) => void }) {
  const words = useDictionary()
  return (
    <DragHandleMenu>
      <RemoveBlockItem>{words.drag_handle.delete_menuitem}</RemoveBlockItem>
      <BlockColorsItem>{words.drag_handle.colors_menuitem}</BlockColorsItem>
      <TableRowHeaderItem>{words.drag_handle.header_row_menuitem}</TableRowHeaderItem>
      <TableColumnHeaderItem>{words.drag_handle.header_column_menuitem}</TableColumnHeaderItem>
      {onDraw && <DrawItem onDraw={onDraw} />}
    </DragHandleMenu>
  )
}

// BlockNote's own side menu, with the item above added to its block menu.
export function SideMenuWithMermaid({ onDraw }: { onDraw?: (block: MermaidBlock) => void }) {
  return (
    <SideMenuController
      sideMenu={(props) => <SideMenu {...props} dragHandleMenu={() => <BlockMenu onDraw={onDraw} />} />}
    />
  )
}
