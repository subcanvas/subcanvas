"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { FileText, Workflow } from "lucide-react"
import Link from "next/link"
import { createContext, useContext } from "react"

import { useProjectAddresses } from "@/components/project-addresses"
import { documentLinkConfig } from "@/lib/text/custom-blocks"
import { useDocumentMeta } from "@/lib/use-document-meta"

// Where the text document being edited sits, which a link inside it needs
// in order to extend the breadcrumb trail.
export type TextDocumentContext = {
  orgId: string
  projectId: string
  slug: string
  documentId: string
  // The documents the reader passed through to get here, outermost first.
  via: string[]
}

export const TextDocumentContextProvider = createContext<TextDocumentContext | null>(null)

function DocumentLinkCard({ docId }: { docId: string }) {
  const context = useContext(TextDocumentContextProvider)
  const meta = useDocumentMeta(docId || null)
  const addresses = useProjectAddresses()

  if (meta === undefined)
    return <div className="h-11 w-full animate-pulse rounded-md bg-muted" contentEditable={false} />

  if (!meta || !context)
    return (
      <div
        contentEditable={false}
        className="w-full rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground"
      >
        This document was deleted, or you do not have access to it.
      </div>
    )

  const Icon = meta.type === "whiteboard" ? Workflow : FileText
  return (
    <Link
      contentEditable={false}
      href={addresses.href(meta.id, [...context.via, context.documentId])}
      className="sc-document-link flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium no-underline hover:bg-muted"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{meta.title}</span>
      {meta.trashed && <span className="text-xs font-normal text-muted-foreground">In trash</span>}
      <span className="ml-auto text-xs font-normal text-muted-foreground">
        {meta.type === "whiteboard" ? "Whiteboard" : "Page"}
      </span>
    </Link>
  )
}

// A document nested in, or linked from, a text document (R2.5).
export const createDocumentLink = createReactBlockSpec(
  documentLinkConfig,
  {
    render: ({ block }) => <DocumentLinkCard docId={block.props.docId} />,
  }
)
