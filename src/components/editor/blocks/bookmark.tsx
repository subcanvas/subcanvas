"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { Globe } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { bookmarkConfig, hostOf, parseBookmark, safeUrl } from "@/lib/text/custom-blocks"

// A link shown as a card: its title, a line of description, and where it
// goes. Imported bookmarks arrive with their title and description; one
// added here starts from its address, and the title can be written in.

function AddressForm({ onSave }: { onSave: (url: string) => void }) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  function save() {
    const url = /^[a-z][a-z0-9+.-]*:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
    if (!value.trim() || !safeUrl(url)) return setError("Enter a web address, such as example.com.")
    try {
      new URL(url)
    } catch {
      return setError("That is not a web address.")
    }
    onSave(url)
  }

  return (
    <form
      className="sc-bookmark-form"
      contentEditable={false}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <label htmlFor={id} className="sr-only">
        Bookmark address
      </label>
      <Input
        id={id}
        autoFocus
        value={value}
        placeholder="Paste a link to bookmark"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          setValue(event.target.value)
          setError(null)
        }}
      />
      <Button type="submit" size="sm">
        Bookmark
      </Button>
      {error && (
        <p id={`${id}-error`} role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

function BookmarkCard({ url, title, description }: { url: string; title: string; description: string }) {
  const href = safeUrl(url)
  const host = hostOf(url)
  const body = (
    <>
      <span className="sc-bookmark-title">{title || host}</span>
      {description && <span className="sc-bookmark-description">{description}</span>}
      <span className="sc-bookmark-host">
        <Globe aria-hidden className="size-3.5" />
        {href ? url.replace(/^https?:\/\//, "") : url}
      </span>
    </>
  )
  // An address that is not a web page (an old import, say) is shown, never opened.
  if (!href)
    return (
      <div className="sc-bookmark" contentEditable={false}>
        {body}
      </div>
    )
  return (
    <a className="sc-bookmark" contentEditable={false} href={href} target="_blank" rel="noopener noreferrer nofollow">
      {body}
    </a>
  )
}

export const createBookmark = createReactBlockSpec(bookmarkConfig, {
  parse: parseBookmark,
  render: ({ block, editor }) =>
    block.props.url ? (
      <BookmarkCard {...block.props} />
    ) : editor.isEditable ? (
      <AddressForm onSave={(url) => editor.updateBlock(block, { props: { url } })} />
    ) : (
      <span />
    ),
  // A link on a line of its own, which is what Markdown and other editors read.
  toExternalHTML: ({ block }) => (
    <p>
      <a href={block.props.url}>{block.props.title || block.props.url}</a>
    </p>
  ),
})
