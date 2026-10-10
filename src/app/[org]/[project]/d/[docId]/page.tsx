import { notFound, redirect } from "next/navigation"

import { addressOfDocument, getProjectAccess } from "@/lib/project-access"

// A document by id: an address from before readable ones, or a link saved
// inside a document's content (lib/navigation.ts, documentPermalink). It
// leads to the document's readable address, in whichever project it lives.
export default async function DocumentById({ params, searchParams }: PageProps<"/[org]/[project]/d/[docId]">) {
  const { org: slug, project, docId } = await params
  const { supabase } = await getProjectAccess(slug, project)
  const address = await addressOfDocument(supabase, docId, (await searchParams).via)
  if (!address) notFound()
  redirect(address)
}
