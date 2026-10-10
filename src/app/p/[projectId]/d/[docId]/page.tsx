import { notFound, redirect } from "next/navigation"

import { addressOfDocument } from "@/lib/project-access"
import { createClient } from "@/lib/supabase/server"

// A public document's address from before members and visitors shared one,
// as READMEs link to it beside its embed picture (lib/embed.ts). It leads to
// the document's readable address.
export default async function PublicDocumentById({ params, searchParams }: PageProps<"/p/[projectId]/d/[docId]">) {
  const { docId } = await params
  const supabase = await createClient()
  const address = await addressOfDocument(supabase, docId, (await searchParams).via)
  if (!address) notFound()
  redirect(address)
}
