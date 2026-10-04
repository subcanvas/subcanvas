"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="sm" onClick={copy} aria-label={`Copy ${label}`}>
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

// A value to paste somewhere else, with the button that copies it.
export function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-rule bg-sheet py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm whitespace-nowrap">{value}</code>
      <CopyButton label={label} value={value} />
    </div>
  )
}

// A prompt to give an agent: words to read before copying, so they wrap.
export function PromptField({ title, prompt }: { title: string; prompt: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-rule bg-sheet p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm leading-relaxed text-graphite">{prompt}</p>
      </div>
      <CopyButton label={`the prompt: ${title}`} value={prompt} />
    </li>
  )
}
