"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { SmilePlus } from "lucide-react"
import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { calloutConfig, parseCallout, parseCalloutContent } from "@/lib/text/custom-blocks"
import { EMOJI_CATEGORIES } from "@/lib/whiteboard/emoji"
import { singleEmoji } from "@/lib/whiteboard/schema"

// The emoji a callout wears. Anyone who can edit the document can change it:
// from the common ones, by searching them, or by typing any emoji at all.
function CalloutIcon({ icon, editable, onChange }: { icon: string; editable: boolean; onChange: (icon: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const choices = useMemo(() => {
    const words = query.trim().toLowerCase()
    return EMOJI_CATEGORIES.flatMap((category) => category.emoji).filter(
      (choice) => !words || choice.words.includes(words)
    )
  }, [query])

  // A callout imported without an emoji (Notion allows that) has none.
  const face = icon ? (
    <span aria-hidden className="text-lg leading-none">
      {icon}
    </span>
  ) : (
    <SmilePlus aria-hidden className="size-4 text-graphite opacity-60" />
  )
  if (!editable)
    return icon ? (
      <span className="sc-callout-icon" contentEditable={false}>
        {face}
      </span>
    ) : null

  function choose(emoji: string) {
    onChange(emoji)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="sc-callout-icon"
        contentEditable={false}
        aria-label={icon ? `Callout icon: ${icon}. Change it` : "Add an icon to this callout"}
      >
        {face}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <Input
          type="search"
          aria-label="Search emoji, or type any emoji"
          placeholder="Search, or type an emoji"
          value={query}
          onChange={(event) => {
            const typed = singleEmoji(event.target.value)
            if (typed) choose(typed)
            else setQuery(event.target.value)
          }}
        />
        <div role="group" aria-label="Emoji" className="flex max-h-52 flex-wrap gap-0.5 overflow-y-auto">
          {choices.map((choice) => (
            <button
              key={choice.emoji}
              type="button"
              title={choice.words}
              aria-label={choice.words}
              aria-pressed={choice.emoji === icon}
              onClick={() => choose(choice.emoji)}
              className="flex size-8 items-center justify-center rounded-md text-base leading-none outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent"
            >
              {choice.emoji}
            </button>
          ))}
          {!choices.length && <p className="px-1 py-2 text-xs text-graphite">No emoji matches that.</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// A box with an emoji and a colour (Notion's callout). Its colour is the
// block colour every block has, in the block's own menu; blocks nested under
// it are drawn inside the box.
export const createCallout = createReactBlockSpec(calloutConfig, {
  parse: parseCallout,
  parseContent: ({ el, schema }) => parseCalloutContent(el, schema),
  render: ({ block, editor, contentRef }) => (
    <div className="sc-callout">
      <CalloutIcon
        icon={block.props.icon}
        editable={editor.isEditable}
        onChange={(icon) => editor.updateBlock(block, { props: { icon } })}
      />
      <div ref={contentRef} className="sc-callout-text" />
    </div>
  ),
  toExternalHTML: ({ block, contentRef }) => (
    <aside data-icon={block.props.icon}>
      <p ref={contentRef} />
    </aside>
  ),
})
