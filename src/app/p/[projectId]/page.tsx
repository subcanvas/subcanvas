import { notFound, redirect } from "next/navigation"

import { projectHref } from "@/lib/navigation"
import { createClient } from "@/lib/supabase/server"

// A public project's address from before members and visitors shared one
// (lib/public-route.ts). It leads to the project's readable address.
export default async function PublicProjectById({ params }: PageProps<"/p/[projectId]">) {
  const { projectId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound()
  const supabase = await createClient()
  const { data: where } = await supabase.rpc("project_address", { p_project_id: projectId }).maybeSingle()
  if (!where) notFound()
  redirect(projectHref({ slug: where.workspace, project: where.project }))
}
