import { z } from "zod"

import { embedSnippet } from "@/lib/embed"
import { importFromReference } from "@/lib/github/import-reference"
import { publicProjectPath } from "@/lib/public-route"

import { findProject, findTypedDocument, NO_PROJECT, orgSlug } from "../lookup"
import { defineTool, id } from "../tool"

export const integrationTools = [
  defineTool({
    name: "import_github_repository",
    title: "Draw a GitHub repository as a project",
    group: "GitHub and embeds",
    description:
      "Creates a new project from a public GitHub repository: a whiteboard of its top-level folders, a nested whiteboard inside each folder that has folders of its own, every README as a read-only text document, and the arrows its `.subcanvas` files declare. It is a one-time copy. Returns the project and its top whiteboard, plus warnings about anything left out. Large repositories take several seconds.",
    input: {
      org_id: id("The org to create the project in, from `list_orgs`."),
      repository: z.string().min(3).describe("`owner/name`, or the repository's address on github.com."),
      make_public: z.boolean().default(false).describe("Make the new project public, so it can be shared and embedded."),
    },
    kind: "write",
    openWorld: true,
    covers: ["(org)/actions.importFromGitHub"],
    run: async (context, { org_id, repository, make_public }) => {
      const outcome = await importFromReference(context.supabase, {
        orgId: org_id,
        userId: context.userId,
        repository,
        makePublic: make_public,
      })
      if ("error" in outcome) return outcome

      const slug = await orgSlug(context, org_id)
      const url = slug ? `${context.origin}/${slug}/${outcome.projectId}/d/${outcome.documentId}` : null
      return {
        text: [
          `Imported ${outcome.folders} folders into a new project (${outcome.projectId}). Its top whiteboard is ${outcome.documentId}.`,
          ...(url ? [`Open it at ${url}`] : []),
          ...outcome.warnings.map((warning) => `Warning: ${warning}`),
        ].join("\n"),
        data: {
          project_id: outcome.projectId,
          whiteboard_id: outcome.documentId,
          folders: outcome.folders,
          warnings: outcome.warnings,
          url,
        },
      }
    },
  }),

  defineTool({
    name: "get_embed_snippet",
    title: "Get the embed snippet of a public whiteboard",
    group: "GitHub and embeds",
    description:
      "Returns the HTML that shows a whiteboard as a live picture in a README or any page that takes HTML, linking to the explorable version. It follows the reader's light or dark theme and updates within minutes of an edit. The whiteboard's project must be public (`set_project_visibility`); a private one is refused, since its picture could not be loaded by anyone.",
    input: { whiteboard_id: id("A whiteboard in a public project.") },
    kind: "read",
    run: async (context, { whiteboard_id }) => {
      const whiteboard = await findTypedDocument(context, whiteboard_id, "whiteboard")
      if ("error" in whiteboard) return whiteboard
      const project = await findProject(context, whiteboard.project_id)
      if (!project) return NO_PROJECT
      if (project.visibility !== "public")
        return { error: "This whiteboard's project is private, so an embed of it would show nothing. Make the project public first." }

      const snippet = embedSnippet({
        origin: context.origin,
        projectId: project.id,
        docId: whiteboard.id,
        title: whiteboard.title,
      })
      const page = `${context.origin}${publicProjectPath(project.id)}/d/${whiteboard.id}`
      return { text: snippet, data: { html: snippet, page_url: page, image_url: `${page}/embed.svg` } }
    },
  }),
]
