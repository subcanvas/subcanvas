import { PRIVATE } from "@/lib/export/download"
import { readProjectLayout } from "@/lib/export/read"
import { createClient } from "@/lib/supabase/server"

// The first step of exporting a project (docs/EXPORTING.md): its folders and
// documents, and where each goes in the zip. The browser then asks for the
// documents a batch at a time (./documents) and writes the zip itself, so no
// response here is ever the size of the project.

export async function GET(_request: Request, context: RouteContext<"/api/projects/[projectId]/export">) {
  const { projectId } = await context.params
  const supabase = await createClient()
  const project = await readProjectLayout(supabase, projectId)
  if (!project) return Response.json({ error: "No such project, or you cannot read it." }, { status: 404, headers: PRIVATE })
  return Response.json(project, { headers: PRIVATE })
}
