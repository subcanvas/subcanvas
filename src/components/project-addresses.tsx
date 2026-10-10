"use client"

import { createContext, useContext, useMemo } from "react"

import {
  documentHref,
  documentPermalink,
  type DocumentAddress,
  type ProjectPath,
} from "@/lib/navigation"

// The address of every document in the open project, so a box, a link in a
// page, or a row in the list can link by readable address without asking
// the server (lib/navigation.ts). Given by the project's layout.

export type AddressEntry = [id: string, code: string, title: string]

type Book = {
  project: ProjectPath
  byId: Map<string, DocumentAddress>
  idByCode: Map<string, string>
}

const AddressesContext = createContext<Book | null>(null)

export function ProjectAddresses({
  project,
  documents,
  children,
}: {
  project: ProjectPath
  documents: AddressEntry[]
  children: React.ReactNode
}) {
  const book = useMemo(
    () => ({
      project,
      byId: new Map(documents.map(([id, code, title]) => [id, { code, title }])),
      idByCode: new Map(documents.map(([id, code]) => [code, id])),
    }),
    [project, documents]
  )
  return <AddressesContext.Provider value={book}>{children}</AddressesContext.Provider>
}

export function useProjectAddresses() {
  const book = useContext(AddressesContext)
  if (!book) throw new Error("useProjectAddresses needs a ProjectAddresses above it.")
  return useMemo(
    () => ({
      project: book.project,
      // The document's address, with the trail of documents (by id) the
      // reader came through. A document made a moment ago, or one in another
      // project, is not in the book yet: its address by id leads to the
      // readable one.
      href(documentId: string, via: string[] = []) {
        const target = book.byId.get(documentId)
        const codes = via.flatMap((id) => book.byId.get(id)?.code ?? [])
        if (target) return documentHref(book.project, target, codes)
        const permalink = documentPermalink(book.project, documentId)
        return codes.length ? `${permalink}?via=${codes.join(".")}` : permalink
      },
      code: (documentId: string) => book.byId.get(documentId)?.code ?? null,
      idForCode: (code: string) => book.idByCode.get(code) ?? null,
    }),
    [book]
  )
}
