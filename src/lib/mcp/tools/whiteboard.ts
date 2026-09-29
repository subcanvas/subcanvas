import { z } from "zod"

import { loadDocument } from "@/lib/sync/server-document"
import { ICON_CHOICES } from "@/lib/whiteboard/icons"
import { MAX_ALT, MAX_BODY_TEXT, MAX_LABEL, MAX_NODE_SIDE, MAX_TITLE, MIN_NODE_SIZE } from "@/lib/whiteboard/limits"
import { mediaHref } from "@/lib/whiteboard/media"
import { COLOR_KEYS, edgesMap, nodesMap, readEdge, readNode, singleEmoji } from "@/lib/whiteboard/schema"
import { NODE_SHAPES, SHAPE_SIZE } from "@/lib/whiteboard/shapes"

import { editDocument } from "../edit-document"
import { documentUrl, findDocument, findTypedDocument, NO_DOCUMENT } from "../lookup"
import { createInsideObject, reindexLinks } from "../object-documents"
import { defineTool, id, type ToolContext, type ToolResult } from "../tool"
import * as edits from "../whiteboard-edits"
import { writeInitialMarkdown } from "./documents"

const whiteboardId = id("The whiteboard document.")
const nodeId = (what: string) => z.string().min(1).describe(`${what} From \`read_whiteboard\` or the result of \`add_nodes\`.`)
const color = z.enum(COLOR_KEYS).describe("A named color. Themes decide the exact shade. Not for a picture or video.")
const shape = z
  .enum(NODE_SHAPES)
  .describe(
    `The outline of a box (boxes only). By convention: cylinder for a database, diamond for a decision, cloud for something hosted elsewhere, document for a file, hexagon or parallelogram for a process or its input. Default rectangle. Each shape has the size the app gives it: ${NODE_SHAPES.map((name) => `${name} ${SHAPE_SIZE[name].width} by ${SHAPE_SIZE[name].height}`).join(", ")}.`
  )
const title = z.string().max(MAX_TITLE)
// What the app lets a person resize a node to.
const MIN = MIN_NODE_SIZE
const SIZES = `At least ${MIN.plain.width} by ${MIN.plain.height} for a box, ${MIN.text.width} wide for a text node, ${MIN.group.width} by ${MIN.group.height} for a group, and ${MIN.media.width} on either side for a picture or video; at most ${MAX_NODE_SIDE}. A size outside that is brought within it, as the app's resize handles do.`
const side = (axis: "width" | "height") => z.number().positive().max(MAX_NODE_SIDE).describe(`The ${axis}, in canvas units. ${SIZES}`)
const bodyText = z
  .string()
  .max(MAX_BODY_TEXT)
  .describe("Text nodes only: the plain text shown under the heading (the app calls it body text). Other nodes do not show it and refuse it; to give a box or an arrow a description, put a page inside it with `attach_document`.")
// The names the app can draw: a curated part of Lucide, not all of it.
const icon = z
  .enum(ICON_CHOICES.map((choice) => choice.name) as [string, ...string[]])
  .describe("A small icon shown as a badge: on a node's top-right corner, or before an arrow's label.")
const emoji = z
  .string()
  .refine((value) => singleEmoji(value) !== null, "Exactly one emoji.")
  // Stored as the app stores it: the emoji alone, without spaces around it.
  .transform((value) => singleEmoji(value)!)
  .describe("One emoji, shown as a badge beside the icon.")
const coordinate = (axis: string) =>
  z.number().describe(`The ${axis} of the top-left corner, in canvas units (roughly pixels at 100% zoom). For a node in a group it is relative to the group's top-left corner.`)
const openMode = z
  .enum(["panel", "navigate"])
  .describe("How a click opens a page the node or arrow holds: in the side panel, or by going to it as a full page. A whiteboard it holds is always opened by going to it.")
const edgeStyle = {
  label: z.string().max(MAX_LABEL).optional().describe("Text shown on the arrow. An empty string removes it."),
  direction: z.enum(["none", "forward", "reverse", "both"]).optional().describe("Where the arrowheads are. Default forward: from source to target."),
  shape: z.enum(["spline", "step"]).optional().describe("A curve, or right-angled steps. Default spline."),
  stroke: z.enum(["solid", "dotted"]).optional().describe("Default solid."),
  color: color.optional(),
  icon: icon.nullable().optional().describe("An icon before the arrow's label. Null removes it."),
  emoji: emoji.nullable().optional().describe("One emoji before the arrow's label. Null removes it."),
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
      "Returns everything on a whiteboard as compact JSON: its nodes (kind `plain` is a box, `text` is a heading with body text and no box, `group` is a frame that contains other nodes, `media` is a picture or a video whose title is its caption), its arrows (`edges`), and for each the document it holds, if any (`doc_id`, `doc_type`: a page is `text`). A text node's `description` is its body text. A box drawn for a repository folder has its `repository_path`, and its `description` is the folder's summary, which the app shows in the box's panel. A node's `group_id` is the group it is in, and its x and y are then relative to that group. A picture or video's `media` says what it is: `type` (image or video), the file's own `width` and `height` in pixels, its `alt` text, and a `url` that the people who can read this whiteboard can open in their browser. You cannot fetch that url yourself, and there is no tool that uploads a file: people add pictures and videos in the app. A whiteboard a node holds can be read with this tool again, and a page with `read_text_document`: that is how whiteboards nest. What you read is at most about a second behind what people see.",
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
          // What the app shows: a text node's body text, and a folder's
          // summary in its box's panel. Nothing else it holds is drawn.
          ...(node.description && (node.kind === "text" || node.path) ? { description: node.description } : {}),
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          ...(node.parentId ? { group_id: node.parentId } : {}),
          ...(node.color !== "default" ? { color: node.color } : {}),
          ...(node.shape !== "rectangle" ? { shape: node.shape } : {}),
          ...(node.icon ? { icon: node.icon } : {}),
          ...(node.emoji ? { emoji: node.emoji } : {}),
          ...(node.docId ? { doc_id: node.docId, doc_type: node.docType, open_mode: node.openMode } : {}),
          ...(node.path ? { repository_path: node.path } : {}),
          ...(node.kind === "media" && node.mediaPath
            ? {
                media: {
                  type: node.mediaType,
                  width: node.mediaWidth,
                  height: node.mediaHeight,
                  ...(node.alt ? { alt: node.alt } : {}),
                  url: `${context.origin}${mediaHref(node.mediaPath)}`,
                },
              }
            : {}),
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
          ...(edge.icon ? { icon: edge.icon } : {}),
          ...(edge.emoji ? { emoji: edge.emoji } : {}),
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
      "Adds one or more nodes in a single step and returns their ids in the same order, ready for `connect_nodes`. Leave out x and y and each node takes the nearest free spot: beside `near_node_id` when given, otherwise to the right of what is already there, never on top of another node. Sizes default to what the app gives a new node: a box its shape's size (160 by 64 for a rectangle), a group 360 by 240, a text node 240 wide and as tall as its text. To give a box a description, put a page inside it afterwards with `attach_document`. To lay out a whole diagram, add everything, connect it, then call `arrange_nodes`.",
    input: {
      whiteboard_id: whiteboardId,
      nodes: z
        .array(
          z.object({
            kind: z.enum(["plain", "text", "group"]).default("plain").describe("`plain`: a box. `text`: a heading with body text under it and no box. `group`: a frame other nodes can be put in."),
            title: title.describe("The text shown on the node: a box's title, a text node's heading, a group's title."),
            description: bodyText.optional(),
            color: color.optional(),
            shape: shape.optional(),
            icon: icon.optional(),
            emoji: emoji.optional(),
            x: coordinate("x").optional(),
            y: coordinate("y").optional(),
            width: side("width").optional(),
            height: side("height").optional().describe("Ignored for a text node, which is as tall as its text."),
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
      "Changes nodes in place: move (x, y), resize (width, height), retitle, recolor, reshape a box, set or remove the icon and emoji badges, change a text node's body text, or change how a click opens what the node holds. A box that changes shape while it is still the size its old shape came in takes the new shape's size, as in the app, unless you give a size. On a picture or video the title is the caption, `alt` says what it shows, and it keeps its file's proportions: give its width or its height and the other follows. Only the fields you give change, so this merges with what people are doing to the same node. A field the node cannot show (body text on a box, a shape on a group) is refused. If any id is unknown or any field refused, nothing changes.",
    input: {
      whiteboard_id: whiteboardId,
      nodes: z
        .array(
          z.object({
            id: nodeId("The node to change."),
            title: title.optional().describe("A box's title, a text node's heading, a group's title, or a picture or video's caption."),
            description: bodyText.optional(),
            alt: z.string().max(MAX_ALT).optional().describe("Pictures and videos only: what it shows, for someone who cannot see it."),
            color: color.optional(),
            shape: shape.optional(),
            icon: icon.nullable().optional().describe("Null removes the icon."),
            emoji: emoji.nullable().optional().describe("Null removes the emoji."),
            x: coordinate("x").optional(),
            y: coordinate("y").optional(),
            width: side("width").optional(),
            height: side("height").optional(),
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
      "Deletes nodes, along with every arrow attached to them and, for a group, everything inside it. Documents the nodes held are not deleted; they stay in the project. There is no trash for nodes, and a person's undo does not reach an agent's edits, so this is only undone by adding them again.",
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
      "Draws one or more arrows between nodes and returns their ids. Each arrow leaves and enters by the sides that make the shortest path; which sides cannot be chosen here. An arrow can carry a label, and like a node it can hold a document (`attach_document`).",
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
    description: "Changes arrows in place: label, its icon and emoji, direction, shape, stroke, color, or how a click opens what the arrow holds. Only the fields you give change. To connect different nodes, delete the arrow and add a new one.",
    input: {
      whiteboard_id: whiteboardId,
      edges: z.array(z.object({ id: nodeId("The arrow to change."), ...edgeStyle, open_mode: openMode.optional() })).min(1).max(400),
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
    input: { whiteboard_id: whiteboardId, edge_ids: z.array(nodeId("An arrow to delete.")).min(1).max(400) },
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
      title: title.describe("The group's title."),
      color: color.optional(),
      node_ids: z.array(nodeId("A node to put in the group.")).max(200).optional(),
      x: coordinate("x").optional(),
      y: coordinate("y").optional(),
      width: side("width").optional().describe(`Without \`node_ids\` only. Default 360. ${SIZES}`),
      height: side("height").optional().describe(`Without \`node_ids\` only. Default 240. ${SIZES}`),
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
      "Gives a node or an arrow a document that opens from it. `text` creates its description: a page that belongs to the node or arrow, opens in the side panel beside the whiteboard, and is not listed in the project tree (optionally with first content as Markdown). `whiteboard` creates a nested whiteboard inside it, which also appears in the project tree under this whiteboard: this is how a box becomes a whole diagram of its own. `existing_document_id` instead links a document that lives elsewhere in the tree. A node or arrow holds one document; detach the current one first with `detach_document`.",
    input: {
      whiteboard_id: whiteboardId,
      object_id: nodeId("The node or arrow."),
      type: z.enum(["text", "whiteboard"]).optional().describe("What to create: `text` for a page, `whiteboard` for a whiteboard. Leave out when linking an existing document."),
      title: z.string().min(1).max(200).optional().describe("Defaults to the object's title."),
      markdown: z.string().optional().describe("First content, for a new page."),
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
        return { error: "Only a page takes Markdown. Add nodes to the new whiteboard with `add_nodes`." }
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
    description: "Makes a node or an arrow hold nothing again. The document itself is not deleted or moved; trash it separately if it is no longer wanted.",
    input: { whiteboard_id: whiteboardId, object_id: nodeId("The node or arrow.") },
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
