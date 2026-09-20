import { z } from "zod"

import { loadDocument } from "@/lib/sync/server-document"
import { COLOR_KEYS, edgesMap, nodesMap, readEdge, readNode } from "@/lib/whiteboard/schema"

import { editDocument } from "../edit-document"
import { documentUrl, findDocument, findTypedDocument, NO_DOCUMENT } from "../lookup"
import { createInsideObject, reindexLinks } from "../object-documents"
import { defineTool, id, type ToolContext, type ToolResult } from "../tool"
import * as edits from "../whiteboard-edits"
import { writeInitialMarkdown } from "./documents"

const whiteboardId = id("The whiteboard document.")
const nodeId = (what: string) => z.string().min(1).describe(`${what} From \`read_whiteboard\` or the result of \`add_nodes\`.`)
const color = z.enum(COLOR_KEYS).describe("A named color. Themes decide the exact shade.")
const coordinate = (axis: string) =>
  z.number().describe(`The ${axis} of the top-left corner, in canvas units (roughly pixels at 100% zoom). For a node in a group it is relative to the group's top-left corner.`)
const openMode = z
  .enum(["panel", "navigate"])
  .describe("How a click opens what the object holds: in a side panel, or by going to it.")
const edgeStyle = {
  label: z.string().max(200).optional().describe("Text shown on the arrow. An empty string removes it."),
  direction: z.enum(["none", "forward", "reverse", "both"]).optional().describe("Where the arrowheads are. Default forward: from source to target."),
  shape: z.enum(["spline", "step"]).optional().describe("A curve, or right-angled steps. Default spline."),
  stroke: z.enum(["solid", "dotted"]).optional().describe("Default solid."),
  color: color.optional(),
}

// Runs one edit on a whiteboard the caller names, and words the result.
async function change<T extends object>(
  context: ToolContext,
  documentId: string,
  edit: Parameters<typeof editDocument<T>>[2],
  done: (result: T) => { text: string; data: Record<string, unknown> }
): Promise<ToolResult> {
  const whiteboard = await findTypedDocument(context, documentId, "whiteboard")
  if ("error" in whiteboard) return whiteboard
  const result = await editDocument<T>(context, whiteboard.id, edit)
  if ("error" in result) return result
  const { text, data } = done(result)
  return { text, data: { whiteboard_id: whiteboard.id, ...data } }
}

export const whiteboardTools = [
  defineTool({
    name: "read_whiteboard",
    title: "Read a whiteboard",
    group: "Whiteboards",
    description:
      "Returns everything on a whiteboard as compact JSON: nodes (kind `plain` is a box, `text` is a heading with no box, `group` is a frame that contains other nodes), edges (arrows between nodes), and for each the document it holds, if any (`doc_id`, `doc_type`). A node's `group_id` is the group it is in, and its x and y are then relative to that group. A held whiteboard can be read with this tool again, and a held text document with `read_text_document`: that is how diagrams nest. What you read is at most about a second behind what people see.",
    input: { whiteboard_id: whiteboardId },
    kind: "read",
    run: async (context, { whiteboard_id }) => {
      const whiteboard = await findTypedDocument(context, whiteboard_id, "whiteboard")
      if ("error" in whiteboard) return whiteboard
      const doc = await loadDocument(context.supabase, whiteboard.id)
      if (!doc) return { error: "This document could not be read." }

      const nodes = [...nodesMap(doc).entries()].map(([objectId, map]) => {
        const node = readNode(objectId, map)
        return {
          id: node.id,
          kind: node.kind,
          title: node.title,
          ...(node.description ? { description: node.description } : {}),
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          ...(node.parentId ? { group_id: node.parentId } : {}),
          ...(node.color !== "default" ? { color: node.color } : {}),
          ...(node.docId ? { doc_id: node.docId, doc_type: node.docType, open_mode: node.openMode } : {}),
          ...(node.path ? { repository_path: node.path } : {}),
        }
      })
      const known = new Set(nodes.map((node) => node.id))
      const edges = [...edgesMap(doc).entries()]
        .map(([objectId, map]) => readEdge(objectId, map))
        // An edge whose end was deleted by someone else is not drawn.
        .filter((edge) => known.has(edge.source) && known.has(edge.target))
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          ...(edge.label ? { label: edge.label } : {}),
          direction: edge.direction,
          ...(edge.shape !== "spline" ? { shape: edge.shape } : {}),
          ...(edge.stroke !== "solid" ? { stroke: edge.stroke } : {}),
          ...(edge.color !== "default" ? { color: edge.color } : {}),
          ...(edge.docId ? { doc_id: edge.docId, doc_type: edge.docType, open_mode: edge.openMode } : {}),
        }))

      const data = {
        whiteboard_id: whiteboard.id,
        title: whiteboard.title,
        url: await documentUrl(context, whiteboard),
        nodes,
        edges,
      }
      return { text: JSON.stringify(data), data }
    },
  }),

  defineTool({
    name: "add_nodes",
    title: "Add nodes to a whiteboard",
    group: "Whiteboards",
    description:
      "Adds one or more nodes in a single step and returns their ids in the same order, ready for `connect_nodes`. Leave out x and y and each node takes the nearest free spot: beside `near_node_id` when given, otherwise to the right of what is already there, never on top of another node. Sizes default to what the app uses (a box is 160 by 64, a group 360 by 240, a text heading 240 wide). To lay out a whole diagram, add everything, connect it, then call `arrange_nodes`.",
    input: {
      whiteboard_id: whiteboardId,
      nodes: z
        .array(
          z.object({
            kind: z.enum(["plain", "text", "group"]).default("plain").describe("`plain`: a box. `text`: a heading with no box. `group`: a frame other nodes can be put in."),
            title: z.string().max(500).describe("The text shown on the node."),
            description: z.string().max(2000).optional().describe("A short plain-text note shown under the title. For anything longer, attach a text document with `attach_document`."),
            color: color.optional(),
            x: coordinate("x").optional(),
            y: coordinate("y").optional(),
            width: z.number().min(40).max(4000).optional(),
            height: z.number().min(24).max(4000).optional().describe("Ignored for a text node, which is as tall as its text."),
            group_id: nodeId("The group to put the node in.").optional(),
            near_node_id: nodeId("Place the node in free space next to this one.").optional(),
          })
        )
        .min(1)
        .max(200),
    },
    kind: "write",
    run: (context, { whiteboard_id, nodes }) =>
      change(
        context,
        whiteboard_id,
        (doc) =>
          edits.addNodes(
            doc,
            nodes.map(({ group_id, near_node_id, ...node }) => ({ ...node, groupId: group_id, nearNodeId: near_node_id }))
          ),
        ({ ids }) => ({
          text: `Added ${ids.length} node${ids.length === 1 ? "" : "s"}: ${ids.map((added, index) => `"${nodes[index].title}" (${added})`).join(", ")}.`,
          data: { node_ids: ids },
        })
      ),
  }),

  defineTool({
    name: "update_nodes",
    title: "Update nodes",
    group: "Whiteboards",
    description:
      "Changes nodes in place: move (x, y), resize (width, height), retitle, recolor, change the description, or change how a click opens what the node holds. Only the fields you give change, so this merges with what people are doing to the same node. If any id is unknown, nothing changes.",
    input: {
      whiteboard_id: whiteboardId,
      nodes: z
        .array(
          z.object({
            id: nodeId("The node to change."),
            title: z.string().max(500).optional(),
            description: z.string().max(2000).optional(),
            color: color.optional(),
            x: coordinate("x").optional(),
            y: coordinate("y").optional(),
            width: z.number().min(40).max(4000).optional(),
            height: z.number().min(24).max(4000).optional(),
            open_mode: openMode.optional(),
          })
        )
        .min(1)
        .max(200),
    },
    kind: "idempotent-write",
    run: (context, { whiteboard_id, nodes }) =>
      change(
        context,
        whiteboard_id,
        (doc) => edits.updateNodes(doc, nodes.map(({ open_mode, ...node }) => ({ ...node, openMode: open_mode }))),
        ({ ids }) => ({ text: `Updated ${ids.length} node${ids.length === 1 ? "" : "s"}.`, data: { node_ids: ids } })
      ),
  }),

  defineTool({
    name: "delete_nodes",
    title: "Delete nodes",
    group: "Whiteboards",
    description:
      "Deletes nodes, along with every arrow attached to them and, for a group, everything inside it. Documents the nodes held are not deleted; they stay in the project. There is no trash for nodes, so this is only undone by adding them again.",
    input: { whiteboard_id: whiteboardId, node_ids: z.array(nodeId("A node to delete.")).min(1).max(200) },
    kind: "destructive",
    run: (context, { whiteboard_id, node_ids }) =>
      change(
        context,
        whiteboard_id,
        (doc) => edits.deleteNodes(doc, node_ids),
        ({ nodes, edges }) => ({
          text: `Deleted ${nodes.length} node${nodes.length === 1 ? "" : "s"} and ${edges.length} attached arrow${edges.length === 1 ? "" : "s"}.`,
          data: { deleted_node_ids: nodes, deleted_edge_ids: edges },
        })
      ),
  }),

  defineTool({
    name: "connect_nodes",
    title: "Connect nodes with arrows",
    group: "Whiteboards",
    description:
      "Draws one or more arrows between nodes and returns their ids. Each arrow leaves and enters by the sides that make the shortest path. An arrow can carry a label, and like a node it can hold a document (`attach_document`).",
    input: {
      whiteboard_id: whiteboardId,
      edges: z
        .array(z.object({ source: nodeId("The node the arrow starts at."), target: nodeId("The node it ends at."), ...edgeStyle }))
        .min(1)
        .max(400),
    },
    kind: "write",
    run: (context, { whiteboard_id, edges }) =>
      change(
        context,
        whiteboard_id,
        (doc) => edits.connectNodes(doc, edges),
        ({ ids }) => ({ text: `Added ${ids.length} arrow${ids.length === 1 ? "" : "s"} (${ids.join(", ")}).`, data: { edge_ids: ids } })
      ),
  }),

  defineTool({
    name: "update_edges",
    title: "Update arrows",
    group: "Whiteboards",
    description: "Changes arrows in place: label, direction, shape, stroke, color, or how a click opens what the arrow holds. Only the fields you give change. To connect different nodes, delete the arrow and add a new one.",
    input: {
      whiteboard_id: whiteboardId,
      edges: z.array(z.object({ id: nodeId("The edge to change."), ...edgeStyle, open_mode: openMode.optional() })).min(1).max(400),
    },
    kind: "idempotent-write",
    run: (context, { whiteboard_id, edges }) =>
      change(
        context,
        whiteboard_id,
        (doc) => edits.updateEdges(doc, edges.map(({ open_mode, ...edge }) => ({ ...edge, openMode: open_mode }))),
        ({ ids }) => ({ text: `Updated ${ids.length} arrow${ids.length === 1 ? "" : "s"}.`, data: { edge_ids: ids } })
      ),
  }),

  defineTool({
    name: "delete_edges",
    title: "Delete arrows",
    group: "Whiteboards",
    description: "Deletes arrows. The nodes they joined stay, and so does any document an arrow held.",
    input: { whiteboard_id: whiteboardId, edge_ids: z.array(nodeId("An edge to delete.")).min(1).max(400) },
    kind: "destructive",
    run: (context, { whiteboard_id, edge_ids }) =>
      change(
        context,
        whiteboard_id,
        (doc) => edits.deleteEdges(doc, edge_ids),
        ({ ids }) => ({ text: `Deleted ${ids.length} arrow${ids.length === 1 ? "" : "s"}.`, data: { deleted_edge_ids: ids } })
      ),
  }),

  defineTool({
    name: "create_group",
    title: "Create a group",
    group: "Whiteboards",
    description:
      "Creates a group: a titled frame that contains nodes and moves with them. Give `node_ids` and the group is drawn around those nodes and they become its members (they must currently share a parent). Without them it is an empty frame, placed at x and y or in free space.",
    input: {
      whiteboard_id: whiteboardId,
      title: z.string().max(500).describe("The group's title."),
      color: color.optional(),
      node_ids: z.array(nodeId("A node to put in the group.")).max(200).optional(),
      x: coordinate("x").optional(),
      y: coordinate("y").optional(),
      width: z.number().min(80).max(8000).optional(),
      height: z.number().min(80).max(8000).optional(),
    },
    kind: "write",
    run: (context, { whiteboard_id, node_ids, ...group }) =>
      change(
        context,
        whiteboard_id,
        (doc) => edits.createGroup(doc, { ...group, nodeIds: node_ids }),
        (created) => ({ text: `Created the group "${group.title}" (${created.id}).`, data: { group_id: created.id } })
      ),
  }),

  defineTool({
    name: "set_group_membership",
    title: "Move nodes into or out of a group",
    group: "Whiteboards",
    description: "Puts nodes into a group, or with `group_id` null takes them out of any group. The nodes stay where they are on the canvas; only what they belong to changes. Resize or move the group with `update_nodes` if they should sit inside its frame.",
    input: {
      whiteboard_id: whiteboardId,
      node_ids: z.array(nodeId("A node to move.")).min(1).max(200),
      group_id: nodeId("The group to put them in, or null for none.").nullable(),
    },
    kind: "idempotent-write",
    run: (context, { whiteboard_id, node_ids, group_id }) =>
      change(
        context,
        whiteboard_id,
        (doc) => edits.setGroup(doc, node_ids, group_id),
        ({ ids }) => ({
          text: group_id ? `Moved ${ids.length} node${ids.length === 1 ? "" : "s"} into the group.` : `Took ${ids.length} node${ids.length === 1 ? "" : "s"} out of their group.`,
          data: { node_ids: ids, group_id },
        })
      ),
  }),

  defineTool({
    name: "arrange_nodes",
    title: "Lay out a whiteboard automatically",
    group: "Whiteboards",
    description:
      "Moves every node at the top level of the whiteboard (or, with `group_id`, every node directly inside that group) into a tidy layout: nodes joined by arrows flow left to right along them, the rest go in a grid underneath. Arrows are re-attached to the nearest sides. This overwrites positions people chose by hand, so use it on a diagram you built, or when asked.",
    input: { whiteboard_id: whiteboardId, group_id: nodeId("Lay out the inside of this group instead of the top level.").optional() },
    kind: "destructive",
    run: (context, { whiteboard_id, group_id }) =>
      change(
        context,
        whiteboard_id,
        (doc) => edits.arrangeNodes(doc, group_id ?? null),
        ({ ids }) => ({ text: `Arranged ${ids.length} node${ids.length === 1 ? "" : "s"}.`, data: { node_ids: ids } })
      ),
  }),

  defineTool({
    name: "attach_document",
    title: "Put a document inside a node or arrow",
    group: "Whiteboards",
    description:
      "Gives a node, group, or arrow a document that opens from it. `text` creates its description: a text document that belongs to the object and opens in a side panel (optionally with first content as Markdown). `whiteboard` creates a nested whiteboard inside the object, which also appears in the project tree under this whiteboard: this is how a box becomes a whole diagram. `existing_document_id` instead links a document that lives elsewhere. An object holds one document; detach the current one first with `detach_document`.",
    input: {
      whiteboard_id: whiteboardId,
      object_id: nodeId("The node, group, or edge."),
      type: z.enum(["text", "whiteboard"]).optional().describe("What to create. Leave out when linking an existing document."),
      title: z.string().min(1).max(200).optional().describe("Defaults to the object's title."),
      markdown: z.string().optional().describe("First content, for a new text document."),
      existing_document_id: id("Link this existing document instead of creating one.").optional(),
    },
    kind: "write",
    run: async (context, { whiteboard_id, object_id, type, title, markdown, existing_document_id }) => {
      const whiteboard = await findTypedDocument(context, whiteboard_id, "whiteboard")
      if ("error" in whiteboard) return whiteboard
      if (!type === !existing_document_id)
        return { error: "Give either `type`, to create a document, or `existing_document_id`, to link one." }

      if (existing_document_id) {
        const target = await findDocument(context, existing_document_id)
        if (!target || target.project_id !== whiteboard.project_id)
          return target ? { error: "Only a document of the same project can be linked." } : NO_DOCUMENT
        // What the app's own picker offers: documents of the tree, not
        // descriptions, and nothing from the trash.
        if (target.kind !== "standard" || target.deleted_at)
          return { error: "Only a document that is in the project's tree can be linked." }
        if (target.id === whiteboard.id) return { error: "A whiteboard cannot hold itself." }
        const linked = await editDocument(context, whiteboard.id, (doc) =>
          edits.setObjectDocument(doc, object_id, { docId: target.id, docType: target.type })
        )
        if ("error" in linked) return linked
        await reindexLinks(context, whiteboard)
        return { text: `Linked "${target.title}" (${target.id}).`, data: { document_id: target.id, type: target.type } }
      }

      const kind = type!
      if (markdown !== undefined && kind !== "text")
        return { error: "Only a text document takes Markdown. Add nodes to the new whiteboard with `add_nodes`." }
      const created = await createInsideObject(context, whiteboard, object_id, kind, title)
      if ("error" in created) return created
      if (markdown) {
        const written = await writeInitialMarkdown(context, created.id, markdown)
        if ("error" in written) return written
      }
      return {
        text: `Created the ${kind === "text" ? "description" : "nested whiteboard"} (${created.id}) inside the object.`,
        data: { document_id: created.id, type: kind },
      }
    },
  }),

  defineTool({
    name: "detach_document",
    title: "Detach the document from a node or arrow",
    group: "Whiteboards",
    description: "Makes a node, group, or arrow hold nothing again. The document itself is not deleted or moved; trash it separately if it is no longer wanted.",
    input: { whiteboard_id: whiteboardId, object_id: nodeId("The node, group, or edge.") },
    kind: "idempotent-write",
    run: async (context, { whiteboard_id, object_id }) => {
      const result = await change(
        context,
        whiteboard_id,
        (doc) => edits.setObjectDocument(doc, object_id, null),
        () => ({ text: "Detached.", data: { object_id } })
      )
      if (!("error" in result)) {
        const whiteboard = await findDocument(context, whiteboard_id)
        if (whiteboard) await reindexLinks(context, whiteboard)
      }
      return result
    },
  }),
]
