import type { DocumentType } from "@/lib/tree"

// The playground's starting project (app/api/playground/seed), as a visitor's
// browser receives it: each document's place, and its first content as one
// Yjs update, in base64.
export type PlaygroundSeed = {
  topDocumentId: string
  documents: SeedDocument[]
  contents: Record<string, string>
}

export type SeedDocument = {
  id: string
  type: DocumentType
  kind: "standard" | "description"
  title: string
  parentId: string | null
  parentObjectId: string | null
}
