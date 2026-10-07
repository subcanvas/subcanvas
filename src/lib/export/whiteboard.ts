import type * as Y from "yjs"

import type { ProjectSource } from "@/lib/github/source"
import { codeLinkOf } from "@/lib/whiteboard/code-link"
import { renderWhiteboardSvg } from "@/lib/whiteboard/render-svg"
import { edgesMap, nodesMap, readEdge, readNode, type WbEdge, type WbNode } from "@/lib/whiteboard/schema"

// A whiteboard in an export is two files (docs/EXPORTING.md): the picture
// the embed renderer draws, and a JSON file of everything on it, for a
// program or a later import to read. Pure, so the server that reads the
// whiteboard and the browser that knows where each file went share it.

export type WhiteboardContents = { nodes: WbNode[]; edges: WbEdge[] }

export function readWhiteboard(doc: Y.Doc): WhiteboardContents {
  const nodes = [...nodesMap(doc).entries()].map(([id, map]) => readNode(id, map))
  const known = new Set(nodes.map((node) => node.id))
  // An arrow whose end was deleted is not drawn anywhere, so it is not kept.
  const edges = [...edgesMap(doc).entries()]
    .map(([id, map]) => readEdge(id, map))
    .filter((edge) => known.has(edge.source) && known.has(edge.target))
  return { nodes, edges }
}

export function whiteboardSvg(
  contents: WhiteboardContents,
  title: string,
  host: string,
  repository: ProjectSource | null = null
) {
  return renderWhiteboardSvg({ ...contents, theme: "light", title, host, repository })
}

// The document a box or an arrow holds. `path` is its file in the export
// when it is in it (a whiteboard's JSON file); `url` its address in the app
// otherwise, when the reader can open it.
export type HeldDocument = { title: string | null; path: string | null; url: string | null }
// A picture or video, filed in the export at `path` when it could be fetched.
export type MediaFile = { path: string | null; url: string }

export const WHITEBOARD_FORMAT = "subcanvas-whiteboard"

export function whiteboardFile({
  id,
  title,
  contents,
  held,
  media,
  repository = null,
}: {
  id: string
  title: string
  contents: WhiteboardContents
  held: (documentId: string) => HeldDocument
  media: (mediaPath: string) => MediaFile
  // Where the project was imported from, for the folder links of its boxes.
  repository?: ProjectSource | null
}) {
  // The code link a node opens, and whether it is the folder it was
  // imported from rather than a link of its own.
  const code = (node: WbNode) => {
    const link = codeLinkOf(node, repository)
    return { code_url: link?.url ?? null, code_url_from_folder: link?.derived ?? false }
  }
  const holds = (object: { docId: string | null; docType: WbNode["docType"] }) => {
    if (!object.docId) return null
    return { id: object.docId, type: object.docType, ...held(object.docId) }
  }
  return {
    format: WHITEBOARD_FORMAT,
    version: 1,
    id,
    title,
    // Every field of every object, defaults included, so that nothing on
    // the canvas depends on knowing what the defaults were.
    nodes: contents.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      title: node.title,
      description: node.description,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      group: node.parentId,
      color: node.color,
      shape: node.shape,
      icon: node.icon,
      emoji: node.emoji,
      open_mode: node.openMode,
      repository_path: node.path,
      ...code(node),
      holds: holds(node),
      media: node.mediaPath
        ? {
            type: node.mediaType,
            width: node.mediaWidth,
            height: node.mediaHeight,
            alt: node.alt,
            ...media(node.mediaPath),
          }
        : null,
    })),
    edges: contents.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      source_handle: edge.sourceHandle,
      target_handle: edge.targetHandle,
      label: edge.label,
      direction: edge.direction,
      shape: edge.shape,
      stroke: edge.stroke,
      color: edge.color,
      icon: edge.icon,
      emoji: edge.emoji,
      code_url: edge.codeUrl,
      open_mode: edge.openMode,
      holds: holds(edge),
    })),
  }
}
