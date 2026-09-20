import { z } from "zod"

import * as operations from "@/lib/documents/operations"
import { readOrgAccess } from "@/lib/org-access"
import { buildTree, type DocumentRow, type FolderRow, type TreeNode } from "@/lib/tree"

import { findProject, NO_ORG, NO_PROJECT, orgSlug } from "../lookup"
import { defineTool, id } from "../tool"

const visibility = z
  .enum(["private", "public"])
  .describe("A public project can be read by anyone with its address. Only members can change it.")

function outline(nodes: TreeNode[], depth = 0): string[] {
  return nodes.flatMap((node) => [
    `${"  ".repeat(depth)}- ${node.kind === "folder" ? "folder" : node.type} "${node.name}" (${node.id})`,
    ...outline(node.children, depth + 1),
  ])
}

export const projectTools = [
  defineTool({
    name: "list_orgs",
    title: "List orgs",
    group: "Orgs and projects",
    description:
      "Lists the orgs the signed-in person belongs to, with their role in each. Start here: every project lives in an org, and the role decides what you may do (viewer: read only; editor, admin, owner: read and write). `can_edit` is false for a viewer, and for everyone but the owner of an org whose paid plan has lapsed.",
    input: {},
    kind: "read",
    run: async (context) => {
      const { data, error } = await context.supabase
        .from("org_members")
        .select("role, orgs(id, name, slug)")
        .eq("user_id", context.userId)
      if (error) return { error: error.message }

      const orgs = await Promise.all(
        data.flatMap((row) =>
          row.orgs
            ? [
                readOrgAccess(context.supabase, context.userId, row.orgs.id).then((access) => ({
                  id: row.orgs.id,
                  name: row.orgs.name,
                  slug: row.orgs.slug,
                  role: row.role,
                  can_edit: access?.canEdit ?? false,
                })),
              ]
            : []
        )
      )
      return {
        text: orgs.length
          ? orgs.map((org) => `- ${org.name} (${org.id}): ${org.role}${org.can_edit ? "" : ", read only"}`).join("\n")
          : "You are not a member of any org yet. Create one in the web app first.",
        data: { orgs },
      }
    },
  }),

  defineTool({
    name: "list_projects",
    title: "List projects",
    group: "Orgs and projects",
    description:
      "Lists the projects of one org, oldest first, with how many documents each holds. Use `get_project` next to see what is inside one.",
    input: { org_id: id("The org, from `list_orgs`.") },
    kind: "read",
    run: async (context, { org_id }) => {
      const slug = await orgSlug(context, org_id)
      if (!slug) return NO_ORG
      const { data, error } = await context.supabase
        .from("projects")
        .select("id, name, visibility, source, documents(count)")
        .eq("org_id", org_id)
        .eq("documents.kind", "standard")
        .is("documents.deleted_at", null)
        .order("created_at")
      if (error) return { error: error.message }

      const projects = data.map((project) => ({
        id: project.id,
        name: project.name,
        visibility: project.visibility,
        documents: project.documents[0]?.count ?? 0,
        imported_from: project.source,
        url: `${context.origin}/${slug}/${project.id}`,
      }))
      return {
        text: projects.length
          ? projects.map((p) => `- "${p.name}" (${p.id}): ${p.visibility}, ${p.documents} documents`).join("\n")
          : "This org has no projects yet.",
        data: { projects },
      }
    },
  }),

  defineTool({
    name: "get_project",
    title: "Get a project and its document tree",
    group: "Orgs and projects",
    description:
      "Returns one project and the tree of everything in it: folders, whiteboards, and text documents, nested the way the sidebar shows them. A document nested under a whiteboard lives inside one of that whiteboard's nodes or arrows. Documents in the trash are left out; pass `include_trash` to list them separately.",
    input: {
      project_id: id("The project, from `list_projects`."),
      include_trash: z.boolean().default(false).describe("Also list the documents in this project's trash."),
    },
    kind: "read",
    run: async (context, { project_id, include_trash }) => {
      const project = await findProject(context, project_id)
      if (!project) return NO_PROJECT

      const [{ data: folders }, { data: documents }, slug] = await Promise.all([
        context.supabase
          .from("folders")
          .select("id, name, parent_folder_id, position")
          .eq("project_id", project_id),
        context.supabase
          .from("documents")
          .select("id, title, type, folder_id, parent_document_id, position, deleted_at")
          .eq("project_id", project_id)
          .eq("kind", "standard"),
        orgSlug(context, project.org_id),
      ])
      const live = (documents ?? []).filter((document) => document.deleted_at === null)
      const trash = (documents ?? [])
        .filter((document) => document.deleted_at !== null)
        .map(({ id: documentId, title, type, deleted_at }) => ({ id: documentId, title, type, deleted_at }))
      const tree = buildTree((folders ?? []) as FolderRow[], live as DocumentRow[])

      return {
        text: [
          `Project "${project.name}" (${project.id}), ${project.visibility}`,
          ...(tree.length ? outline(tree) : ["(empty)"]),
          ...(include_trash ? [`In the trash: ${trash.length ? trash.map((d) => `"${d.title}" (${d.id})`).join(", ") : "nothing"}`] : []),
        ].join("\n"),
        data: {
          project: {
            id: project.id,
            org_id: project.org_id,
            name: project.name,
            visibility: project.visibility,
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
    group: "Orgs and projects",
    description:
      "Creates an empty project in an org. Needs the editor role or higher. Follow with `create_document` to put a first whiteboard or text document in it.",
    input: {
      org_id: id("The org to create it in, from `list_orgs`."),
      name: z.string().min(1).max(200).describe("The project's name."),
      visibility: visibility.default("private"),
    },
    kind: "write",
    covers: ["[org]/(org)/actions.createProject"],
    run: async (context, { org_id, name, visibility: wanted }) => {
      const result = await operations.createProject(context.supabase, {
        orgId: org_id,
        userId: context.userId,
        name,
        visibility: wanted,
      })
      if ("error" in result) return result
      const slug = await orgSlug(context, org_id)
      return {
        text: `Created project "${name.trim()}" (${result.id}).`,
        data: { project_id: result.id, url: slug ? `${context.origin}/${slug}/${result.id}` : null },
      }
    },
  }),

  defineTool({
    name: "set_project_visibility",
    title: "Make a project public or private",
    group: "Orgs and projects",
    description:
      "Changes who can read a project. Public means anyone with the address can read every document in it, without signing in; ask the person before making something public. Making a project private can fail on the free plan when it would hold more private documents than the plan allows.",
    input: { project_id: id("The project."), visibility },
    kind: "idempotent-write",
    covers: ["[org]/[project]/tree-actions.setProjectVisibility"],
    run: async (context, { project_id, visibility: wanted }) => {
      const result = await operations.setProjectVisibility(context.supabase, project_id, wanted)
      if ("error" in result) return result
      return { text: `The project is now ${wanted}.`, data: { project_id, visibility: wanted } }
    },
  }),
]
