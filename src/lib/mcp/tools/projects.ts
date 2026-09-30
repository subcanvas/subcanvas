import { z } from "zod"

import * as operations from "@/lib/documents/operations"
import { readOrgAccess } from "@/lib/org-access"
import type { Tables } from "@/lib/supabase/database.types"
import { buildTree, type DocumentRow, type FolderRow, type TreeNode } from "@/lib/tree"

import { findProject, NO_ORG, NO_PROJECT, orgSlug } from "../lookup"
import { defineTool, id } from "../tool"

const visibility = z
  .enum(["private", "public"])
  .describe("A public project can be read by anyone with its address; only members can edit it. Making one public takes the admin or owner role.")

// A project the operator took down is public to nobody, whatever its
// visibility says, as its workspace sees in the app.
const TAKEN_DOWN =
  "taken down by the operator after a report: nobody outside the workspace can read it, whatever its visibility says"

function shownAs(project: { visibility: string; taken_down_at: string | null }) {
  return project.taken_down_at ? `${project.visibility}, ${TAKEN_DOWN}` : project.visibility
}

function outline(nodes: TreeNode[], depth = 0): string[] {
  return nodes.flatMap((node) => [
    `${"  ".repeat(depth)}- ${node.kind === "folder" ? "folder" : node.type} "${node.name}" (${node.id})`,
    ...outline(node.children, depth + 1),
  ])
}

export const projectTools = [
  defineTool({
    name: "list_workspaces",
    title: "List workspaces",
    group: "Workspaces and projects",
    description:
      "Lists the workspaces the signed-in person belongs to, with their role in each: their personal workspace first (`personal` is true; it is theirs alone), then the team workspaces they share with others. Start here: every project lives in a workspace, and the role decides what you may do (viewer: read only; editor, admin, owner: read and write). `can_edit` is false for a viewer, and for everyone but the owner of a workspace whose paid plan has lapsed.",
    input: {},
    kind: "read",
    run: async (context) => {
      const { data, error } = await context.supabase
        .from("org_members")
        .select("role, orgs(id, name, slug, personal_owner)")
        .eq("user_id", context.userId)
      if (error) return { error: error.message }

      const workspaces = await Promise.all(
        data.flatMap((row) =>
          row.orgs
            ? [
                readOrgAccess(context.supabase, context.userId, row.orgs.id).then((access) => ({
                  id: row.orgs.id,
                  name: row.orgs.name,
                  slug: row.orgs.slug,
                  personal: row.orgs.personal_owner !== null,
                  role: row.role,
                  can_edit: access?.canEdit ?? false,
                })),
              ]
            : []
        )
      )
      workspaces.sort((a, b) => Number(b.personal) - Number(a.personal))
      return {
        text: workspaces.length
          ? workspaces
              .map(
                (workspace) =>
                  `- ${workspace.name} (${workspace.id}): ${workspace.personal ? "personal, " : ""}${workspace.role}${workspace.can_edit ? "" : ", read only"}`
              )
              .join("\n")
          : "You are not a member of any workspace.",
        data: { workspaces },
      }
    },
  }),

  defineTool({
    name: "list_projects",
    title: "List projects",
    group: "Workspaces and projects",
    description:
      "Lists the projects of one workspace, oldest first, with how many documents each holds. Use `get_project` next to see what is inside one.",
    input: { workspace_id: id("The workspace, from `list_workspaces`.") },
    kind: "read",
    run: async (context, { workspace_id }) => {
      const slug = await orgSlug(context, workspace_id)
      if (!slug) return NO_ORG
      const { data, error } = await context.supabase
        .from("projects")
        // What each shows: nothing in the trash, nor inside something that
        // is. `document_count` is computed by the database, which the
        // generated types do not describe.
        .select("id, name, visibility, taken_down_at, source, document_count")
        .eq("org_id", workspace_id)
        .order("created_at")
        .overrideTypes<
          (Pick<Tables<"projects">, "id" | "name" | "visibility" | "taken_down_at" | "source"> & { document_count: number })[],
          { merge: false }
        >()
      if (error) return { error: error.message }

      const projects = data.map((project) => ({
        id: project.id,
        name: project.name,
        visibility: project.visibility,
        taken_down: project.taken_down_at !== null,
        shown_as: shownAs(project),
        documents: project.document_count,
        imported_from: project.source,
        url: `${context.origin}/${slug}/${project.id}`,
      }))
      return {
        text: projects.length
          ? projects.map((p) => `- "${p.name}" (${p.id}): ${p.shown_as}; ${p.documents} documents`).join("\n")
          : "This workspace has no projects yet.",
        data: { projects },
      }
    },
  }),

  defineTool({
    name: "get_project",
    title: "Get a project and its document tree",
    group: "Workspaces and projects",
    description:
      "Returns one project and the tree of everything in it: folders, whiteboards, and pages, nested the way the sidebar shows them. A document nested under a whiteboard lives inside one of that whiteboard's nodes or arrows. The pages that are nodes' and arrows' descriptions are not in the tree; `read_whiteboard` gives their ids. What is in the trash is left out, with everything inside it; pass `include_trash` to list the trash separately.",
    input: {
      project_id: id("The project, from `list_projects`."),
      include_trash: z.boolean().default(false).describe("Also list the documents and folders in this project's trash."),
    },
    kind: "read",
    run: async (context, { project_id, include_trash }) => {
      const project = await findProject(context, project_id)
      if (!project) return NO_PROJECT

      const [{ data: folders }, { data: documents }, slug] = await Promise.all([
        context.supabase
          .from("folders")
          .select("id, name, parent_folder_id, position, deleted_at")
          .eq("project_id", project_id),
        context.supabase
          .from("documents")
          .select("id, title, type, kind, folder_id, parent_document_id, position, deleted_at")
          .eq("project_id", project_id),
        orgSlug(context, project.org_id),
      ])
      // The tree is walked from the top, so what is inside something in the
      // trash is left out with it.
      const live = (documents ?? []).filter((document) => document.kind === "standard" && document.deleted_at === null)
      const liveFolders = (folders ?? []).filter((folder) => folder.deleted_at === null)
      // A description in the trash is the notes of a node or arrow that was deleted.
      const trash = [
        ...(folders ?? [])
          .filter((folder) => folder.deleted_at !== null)
          .map(({ id: folderId, name, deleted_at }) => ({ kind: "folder" as const, id: folderId, title: name, deleted_at })),
        ...(documents ?? [])
          .filter((document) => document.deleted_at !== null)
          .map(({ id: documentId, title, type, kind, deleted_at }) => ({
            kind: "document" as const,
            id: documentId,
            title,
            type,
            ...(kind === "description" ? { notes_of_a_deleted_object: true } : {}),
            deleted_at,
          })),
      ]
      const tree = buildTree(liveFolders as FolderRow[], live as DocumentRow[])

      return {
        text: [
          `Project "${project.name}" (${project.id}), ${shownAs(project)}`,
          ...(tree.length ? outline(tree) : ["(empty)"]),
          ...(include_trash
            ? [`In the trash: ${trash.length ? trash.map((item) => `${item.kind === "folder" ? "folder" : item.type} "${item.title}" (${item.id})`).join(", ") : "nothing"}`]
            : []),
        ].join("\n"),
        data: {
          project: {
            id: project.id,
            workspace_id: project.org_id,
            name: project.name,
            visibility: project.visibility,
            taken_down: project.taken_down_at !== null,
            imported_from: project.source,
            url: slug ? `${context.origin}/${slug}/${project.id}` : null,
          },
          tree,
          ...(include_trash ? { trash } : {}),
        },
      }
    },
  }),

  defineTool({
    name: "create_project",
    title: "Create a project",
    group: "Workspaces and projects",
    description:
      "Creates an empty project in a workspace. Needs the editor role or higher, and the admin role or higher to create it public. Follow with `create_document` to put a first whiteboard or page in it.",
    input: {
      workspace_id: id("The workspace to create it in, from `list_workspaces`."),
      name: z.string().min(1).max(200).describe("The project's name."),
      visibility: visibility.default("private"),
    },
    kind: "write",
    covers: ["[org]/(org)/actions.createProject"],
    run: async (context, { workspace_id, name, visibility: wanted }) => {
      const result = await operations.createProject(context.supabase, {
        orgId: workspace_id,
        userId: context.userId,
        name,
        visibility: wanted,
      })
      if ("error" in result) return result
      const slug = await orgSlug(context, workspace_id)
      return {
        text: `Created project "${name.trim()}" (${result.id}).`,
        data: { project_id: result.id, url: slug ? `${context.origin}/${slug}/${result.id}` : null },
      }
    },
  }),

  defineTool({
    name: "set_project_visibility",
    title: "Make a project public or private",
    group: "Workspaces and projects",
    description:
      "Changes who can read a project. Needs the admin role or higher. Public means anyone with the address can read every document in it, without signing in; ask the person before making something public. Making a project private can fail on the free plan when it would hold more private documents than the plan allows.",
    input: { project_id: id("The project."), visibility },
    kind: "idempotent-write",
    covers: ["[org]/[project]/tree-actions.setProjectVisibility"],
    run: async (context, { project_id, visibility: wanted }) => {
      const result = await operations.setProjectVisibility(context.supabase, project_id, wanted)
      if ("error" in result) return result
      const project = await findProject(context, project_id)
      const takenDown = Boolean(project?.taken_down_at)
      return {
        text: `The project is now ${wanted}.${takenDown ? ` It is also ${TAKEN_DOWN}.` : ""}`,
        data: { project_id, visibility: wanted, taken_down: takenDown },
      }
    },
  }),

  defineTool({
    name: "rename_project",
    title: "Rename a project",
    group: "Workspaces and projects",
    description:
      "Gives a project a new name, 1 to 120 characters. Needs the editor role or higher. Its address, its documents, and links to it stay the same.",
    input: {
      project_id: id("The project."),
      name: z.string().min(1).max(120).describe("The new name."),
    },
    kind: "idempotent-write",
    covers: ["[org]/[project]/tree-actions.renameProject"],
    run: async (context, { project_id, name }) => {
      const result = await operations.renameProject(context.supabase, project_id, name)
      if ("error" in result) return result
      return { text: `The project is now called "${name.trim()}".`, data: { project_id, name: name.trim() } }
    },
  }),
]
