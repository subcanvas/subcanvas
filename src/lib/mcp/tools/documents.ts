import { z } from "zod"

import * as operations from "@/lib/documents/operations"
import { applyBlockEdit, parseMarkdown } from "@/lib/text/blocks"

import { editDocument } from "../edit-document"
import { documentUrl, findDocument, findProject, findTypedDocument, NO_DOCUMENT, NO_PROJECT } from "../lookup"
import { createInsideObject } from "../object-documents"
import { defineTool, id, type ToolContext } from "../tool"

const container = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("root") }).describe("The top level of the project."),
    z.object({ kind: z.literal("folder"), id: id("The folder.") }),
    z
      .object({ kind: z.literal("document"), id: id("The parent document.") })
      .describe("Nested under another document in the tree, without belonging to one of its objects."),
  ])
  .describe("Where in the project's tree.")

const place = z
  .discriminatedUnion("kind", [
    ...container.options,
    z
      .object({
        kind: z.literal("object"),
        whiteboard_id: id("The whiteboard the node or arrow is on."),
        object_id: id("The node, group, or edge that will hold the new document."),
      })
      .describe("Inside a whiteboard's node, group, or arrow. Same as `attach_document`."),
  ])
  .describe("Where the new document lives. Every document has exactly one home.")

// Writes the first content of a text document that was just created.
export async function writeInitialMarkdown(context: ToolContext, documentId: string, markdown: string) {
  const blocks = await parseMarkdown(markdown)
  return editDocument(context, documentId, (doc) => applyBlockEdit(doc, { kind: "append", blocks }), {
    fresh: true,
  })
}

export const documentTools = [
  defineTool({
    name: "create_document",
    title: "Create a document",
    group: "Documents",
    description:
      "Creates a whiteboard or a text document in a project: at the top level, in a folder, nested under another document, or inside a whiteboard's node, group, or arrow (which is how diagrams nest in Subcanvas). Returns the new document's id. A text document can be given its first content as Markdown. On the free plan this fails with an explanation once the org's private-document allowance is used up.",
    input: {
      project_id: id("The project, from `list_projects`."),
      type: z.enum(["whiteboard", "text"]).describe("A whiteboard is a canvas of nodes and arrows; a text document is a page of rich text."),
      title: z.string().min(1).max(200).optional().describe("Defaults to \"Untitled\", or inside an object to that object's title."),
      place: place.default({ kind: "root" }),
      markdown: z.string().optional().describe("For a text document: its first content, as Markdown."),
    },
    kind: "write",
    covers: ["tree-actions.createDocument"],
    run: async (context, { project_id, type, title, place: where, markdown }) => {
      if (markdown !== undefined && type !== "text")
        return { error: "Only a text document takes Markdown. Add nodes to a whiteboard with `add_nodes`." }
      const project = await findProject(context, project_id)
      if (!project) return NO_PROJECT

      let created: { id: string } | { error: string }
      if (where.kind === "object") {
        const whiteboard = await findTypedDocument(context, where.whiteboard_id, "whiteboard")
        if ("error" in whiteboard) return whiteboard
        created = await createInsideObject(context, whiteboard, where.object_id, type, title)
      } else {
        created = await operations.createDocument(
          context.supabase,
          { orgId: project.org_id, projectId: project.id },
          context.userId,
          type,
          where,
          title?.trim()
        )
      }
      if ("error" in created) return created

      if (markdown) {
        const written = await writeInitialMarkdown(context, created.id, markdown)
        if ("error" in written) return written
      }
      const url = await documentUrl(context, { id: created.id, org_id: project.org_id, project_id: project.id })
      return {
        text: `Created the ${type === "text" ? "text document" : "whiteboard"} (${created.id}).${url ? ` Open it at ${url}` : ""}`,
        data: { document_id: created.id, type, url },
      }
    },
  }),

  defineTool({
    name: "create_folder",
    title: "Create a folder",
    group: "Documents",
    description: "Creates a folder in a project's tree, at the top level or inside another folder. Folders only organize; they hold documents and other folders.",
    input: {
      project_id: id("The project."),
      name: z.string().min(1).max(200).default("New folder").describe("The folder's name."),
      parent_folder_id: id("The folder to create it in. Leave out for the top level.").optional(),
    },
    kind: "write",
    covers: ["tree-actions.createFolder"],
    run: async (context, { project_id, name, parent_folder_id }) => {
      const project = await findProject(context, project_id)
      if (!project) return NO_PROJECT
      const result = await operations.createFolder(
        context.supabase,
        { orgId: project.org_id, projectId: project.id },
        parent_folder_id ?? null,
        name.trim()
      )
      if ("error" in result) return result
      return { text: `Created the folder "${name.trim()}" (${result.id}).`, data: { folder_id: result.id } }
    },
  }),

  defineTool({
    name: "rename_document",
    title: "Rename a document or folder",
    group: "Documents",
    description: "Changes the title of a document, or the name of a folder. Ids do not change, so nothing that points at it breaks.",
    input: {
      kind: z.enum(["document", "folder"]).default("document").describe("What `id` refers to."),
      id: id("The document or folder."),
      name: z.string().min(1).max(200).describe("The new title."),
    },
    kind: "idempotent-write",
    covers: ["tree-actions.renameItem"],
    run: async (context, { kind, id: itemId, name }) => {
      const result = await operations.renameItem(context.supabase, kind, itemId, name)
      if ("error" in result) return result
      return { text: `Renamed to "${name.trim()}".`, data: { id: itemId, name: name.trim() } }
    },
  }),

  defineTool({
    name: "move_document",
    title: "Move a document or folder",
    group: "Documents",
    description:
      "Moves a document or a folder to another place in the same project's tree; it goes after what is already there. A folder cannot go inside a document. A document that lived inside a whiteboard object stops belonging to that object when moved (the object keeps a link to it).",
    input: {
      kind: z.enum(["document", "folder"]).default("document").describe("What `id` refers to."),
      id: id("The document or folder to move."),
      to: container,
    },
    kind: "idempotent-write",
    covers: ["tree-actions.moveItem"],
    run: async (context, { kind, id: itemId, to }) => {
      const result = await operations.moveItem(context.supabase, kind, itemId, to)
      if ("error" in result) return result
      return { text: "Moved.", data: { id: itemId, to } }
    },
  }),

  defineTool({
    name: "trash_document",
    title: "Move a document to the trash",
    group: "Documents",
    description:
      "Moves a document to its project's trash, along with everything nested inside it. Nothing is destroyed: `restore_document` brings it back. Call `list_references` first when other documents may link to it, since those links will show it as trashed.",
    input: { document_id: id("The document.") },
    kind: "destructive",
    covers: ["tree-actions.trashDocument"],
    run: async (context, { document_id }) => {
      const result = await operations.trashDocument(context.supabase, document_id)
      if ("error" in result) return result
      return { text: "Moved to the trash. `restore_document` brings it back.", data: { document_id } }
    },
  }),

  defineTool({
    name: "restore_document",
    title: "Restore a document from the trash",
    group: "Documents",
    description:
      "Takes a document out of the trash and puts it back where it was. If its parent document is still in the trash, it is restored to the top level of the project instead. Can fail on the free plan when restoring would exceed the private-document allowance.",
    input: { document_id: id("A document that is in the trash (see `get_project` with `include_trash`).") },
    kind: "idempotent-write",
    covers: ["tree-actions.restoreDocument"],
    run: async (context, { document_id }) => {
      const result = await operations.restoreDocument(context.supabase, document_id)
      if ("error" in result) return result
      return { text: "Restored.", data: { document_id } }
    },
  }),

  defineTool({
    name: "delete_document_forever",
    title: "Delete a trashed document forever",
    group: "Documents",
    description:
      "Permanently deletes a document that is already in the trash, with everything nested inside it. This cannot be undone, so only do it when the person asked for exactly this. A document that is not in the trash is refused: trash it first.",
    input: { document_id: id("A document that is in the trash.") },
    kind: "destructive",
    covers: ["tree-actions.deleteDocumentForever"],
    run: async (context, { document_id }) => {
      const result = await operations.deleteDocumentForever(context.supabase, document_id)
      if ("error" in result) return result
      return { text: "Deleted forever.", data: { document_id } }
    },
  }),

  defineTool({
    name: "delete_folder",
    title: "Delete a folder",
    group: "Documents",
    description:
      "Deletes an empty folder. A folder that still holds folders or documents is refused: move or trash what is in it first. Documents of that folder that are already in the trash move to the top level, so they can still be restored.",
    input: { folder_id: id("The folder.") },
    kind: "destructive",
    covers: ["tree-actions.deleteFolder"],
    run: async (context, { folder_id }) => {
      const result = await operations.deleteFolder(context.supabase, folder_id)
      if ("error" in result) return result
      return { text: "Deleted the folder.", data: { folder_id } }
    },
  }),

  defineTool({
    name: "list_references",
    title: "List what links to a document",
    group: "Documents",
    description:
      "Lists the titles of the documents that link to this one from somewhere else (a whiteboard object that opens it, or a link block in a text document). Check this before trashing or deleting a document.",
    input: { document_id: id("The document.") },
    kind: "read",
    covers: ["tree-actions.listReferences"],
    run: async (context, { document_id }) => {
      if (!(await findDocument(context, document_id))) return NO_DOCUMENT
      const titles = await operations.listReferences(context.supabase, document_id)
      return {
        text: titles.length ? `Linked from: ${titles.map((title) => `"${title}"`).join(", ")}` : "Nothing links to this document.",
        data: { referenced_by: titles },
      }
    },
  }),
]
