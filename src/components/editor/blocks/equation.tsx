"use client"

import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react"
import katex from "katex"
import { useEffect, useId, useMemo, useRef, useState } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import {
  equationConfig,
  inlineEquationConfig,
  mathML,
  parseEquation,
  parseInlineEquation,
} from "@/lib/text/custom-blocks"
import { cn } from "@/lib/utils"

// Maths in TeX, drawn by KaTeX. KaTeX's own error message is shown in place
// of a formula it cannot read, so a typo is visible, never silent.
function Rendered({ latex, displayMode, className }: { latex: string; displayMode: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(latex, { displayMode, throwOnError: false, output: "htmlAndMathml" }),
    [latex, displayMode]
  )
  // KaTeX's output is built from the TeX by KaTeX, with `trust` off, so it
  // holds no links, scripts or styles from the document.
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function TexField({
  id,
  value,
  onChange,
  onDone,
  inline,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onDone: () => void
  inline: boolean
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  return (
    <Textarea
      id={id}
      ref={field}
      value={value}
      spellCheck={false}
      aria-label="TeX"
      placeholder={inline ? "e^{i\\pi} + 1 = 0" : "\\int_0^1 x^2 \\, dx = \\frac{1}{3}"}
      rows={inline ? 1 : 3}
      className="min-h-0 font-mono text-sm"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        // Enter finishes; Shift+Enter is a new line in display maths.
        if (event.key === "Escape" || (event.key === "Enter" && (inline || !event.shiftKey))) {
          event.preventDefault()
          onDone()
        }
      }}
    />
  )
}

function EquationBlock({ latex, editable, onChange }: { latex: string; editable: boolean; onChange: (latex: string) => void }) {
  // A new, empty equation opens straight into its TeX. While it is being
  // edited it shows what is typed; otherwise, what the document holds.
  const [draft, setDraft] = useState<string | null>(editable && latex === "" ? "" : null)
  const editing = draft !== null
  const shown = draft ?? latex
  const fieldId = useId()

  function done() {
    if (draft !== null && draft !== latex) onChange(draft)
    setDraft(null)
  }

  return (
    <div className="sc-equation" contentEditable={false}>
      {editable ? (
        <button
          type="button"
          className="sc-equation-view"
          aria-expanded={editing}
          aria-controls={editing ? fieldId : undefined}
          aria-label={latex ? `Equation: ${latex}. Edit` : "Empty equation. Add TeX"}
          onClick={() => (editing ? done() : setDraft(latex))}
        >
          {shown ? <Rendered latex={shown} displayMode /> : <span className="sc-equation-empty">Add a TeX equation</span>}
        </button>
      ) : (
        <div className="sc-equation-view">{latex && <Rendered latex={latex} displayMode />}</div>
      )}
      {editable && editing && (
        <div className="sc-equation-source" onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && done()}>
          <TexField id={fieldId} value={shown} onChange={setDraft} onDone={done} inline={false} />
          <p className="text-xs text-graphite">Enter to finish, Shift+Enter for a new line.</p>
        </div>
      )}
    </div>
  )
}

export const createEquation = createReactBlockSpec(equationConfig, {
  parse: parseEquation,
  render: ({ block, editor }) => (
    <EquationBlock
      latex={block.props.latex}
      editable={editor.isEditable}
      onChange={(latex) => editor.updateBlock(block, { props: { latex } })}
    />
  ),
  // MathML, which BlockNote's Markdown writer turns into `$$…$$`.
  toExternalHTML: ({ block }) => <div dangerouslySetInnerHTML={{ __html: mathML(block.props.latex, true) }} />,
})

function InlineEquation({ latex, editable, onChange }: { latex: string; editable: boolean; onChange: (latex: string) => void }) {
  const [draft, setDraft] = useState<string | null>(editable && latex === "" ? "" : null)
  const open = draft !== null
  const shown = draft ?? latex
  const fieldId = useId()

  function done() {
    if (draft !== null && draft !== latex) onChange(draft)
    setDraft(null)
  }

  const face = shown ? (
    <Rendered latex={shown} displayMode={false} />
  ) : (
    <span className="sc-equation-empty">TeX</span>
  )
  if (!editable) return <span className="sc-inline-equation">{face}</span>

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setDraft(latex) : done())}>
      <PopoverTrigger
        className={cn("sc-inline-equation", open && "sc-inline-equation-open")}
        aria-label={latex ? `Equation: ${latex}. Edit` : "Empty equation. Add TeX"}
      >
        {face}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <TexField id={fieldId} value={shown} onChange={setDraft} onDone={done} inline />
      </PopoverContent>
    </Popover>
  )
}

export const inlineEquation = createReactInlineContentSpec(inlineEquationConfig, {
  parse: parseInlineEquation,
  render: ({ inlineContent, editor, updateInlineContent }) => (
    <InlineEquation
      latex={inlineContent.props.latex}
      editable={editor.isEditable}
      onChange={(latex) => updateInlineContent({ type: "inlineEquation", props: { latex } })}
    />
  ),
  toExternalHTML: ({ inlineContent }) => (
    <span dangerouslySetInnerHTML={{ __html: mathML(inlineContent.props.latex, false) }} />
  ),
})
