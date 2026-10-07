import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import * as operations from "@/lib/documents/operations"
import type { Database } from "@/lib/supabase/database.types"
import { changeDocument, IMPORT_HEADER, loadDocument, writeNewDocuments } from "@/lib/sync/server-document"
import { applyBlockEdit } from "@/lib/text/blocks"
import { toBlocks } from "@/lib/import/write"
import type { Container } from "@/lib/tree"
import { uuidV5 } from "@/lib/whiteboard/description-document"
import { MAX_TITLE } from "@/lib/whiteboard/limits"
import { DEFAULT_SIZE, edgesMap, nodesMap, readNode, toYMap, type WbEdge, type WbNode } from "@/lib/whiteboard/schema"

import type { Diagram } from "./diagram"
import { drawDiagram, drawDiagramBeside, type DrawnDiagram, type DrawnPage } from "./draw"
import { parseMermaid } from "./parse"

// A Mermaid diagram written into a project, on the server: as a new
// whiteboard, or added to one that exists. The web app's actions and the
// MCP tool both end here. What the browser adds to an open whiteboard it
// writes itself, so that undo takes it away; only the pages inside its
// boxes come here (writePages).

type Client = SupabaseClient<Database>

export type MermaidOutcome = {
  whiteboardId: string
  keys: Map<string, string>
  boxes: number
  arrows: number
  notes: string[]
}

const KIND_TITLES: Record<Diagram["kind"], string> = {
  flowchart: "Flowchart",
  sequence: "Sequence diagram",
  er: "ER diagram",
}

export const pagesSchema = z
  .array(
    z.object({
      nodeId: z.string().uuid(),
      title: z.string().trim().min(1).max(MAX_TITLE),
      markdown: z.string().max(100_000),
    })
  )
  .max(500)

// Fields as the whiteboard stores them: the id is the key, and what is
// empty is left out.
const stored = (object: WbNode | WbEdge) => toYMap({ ...object, id: null })

// Pages inside boxes that are about to be drawn: an ER diagram's
// attributes. Each is the box's description, with the id the app derives
// for one, so the box and its page find each other however they were made.
export async function writePages(
  supabase: Client,
  whiteboard: { id: string; orgId: string; projectId: string },
  pages: DrawnPage[]
): Promise<operations.OperationResult<{ ids: Map<string, string> }>> {
  if (!pages.length) return { ok: true, ids: new Map() }
  const ids = new Map<string, string>()
  for (const page of pages) ids.set(page.nodeId, await uuidV5(whiteboard.id, page.nodeId))

  const contents: Parameters<typeof writeNewDocuments>[1] = []
  for (const page of pages) {
    const { blocks } = await toBlocks(page.markdown)
    contents.push({ documentId: ids.get(page.nodeId)!, change: (doc) => void applyBlockEdit(doc, { kind: "append", blocks }) })
  }

  const { error } = await supabase
    .from("documents")
    .insert(
      pages.map((page) => ({
        id: ids.get(page.nodeId)!,
        org_id: whiteboard.orgId,
        project_id: whiteboard.projectId,
        type: "text" as const,
        kind: "description" as const,
        title: page.title,
        parent_document_id: whiteboard.id,
        parent_object_id: page.nodeId,
      }))
    )
    .setHeader(IMPORT_HEADER, "1")
  if (error) return operations.fail(error)
  const written = await writeNewDocuments(supabase, contents)
  return written.error ? { error: written.error } : { ok: true, ids }
}

// The drawing, with each box that has a page pointing at it.
function holding(drawn: DrawnDiagram, ids: Map<string, string>): WbNode[] {
  return drawn.nodes.map((node) =>
    ids.has(node.id) ? { ...node, docId: ids.get(node.id)!, docType: "text" as const } : node
  )
}

const outcome = (whiteboardId: string, diagram: Diagram, drawn: DrawnDiagram): MermaidOutcome => ({
  whiteboardId,
  keys: drawn.keys,
  boxes: drawn.nodes.filter((node) => node.kind !== "group").length,
  arrows: drawn.edges.length,
  notes: diagram.notes,
})

export async function createMermaidWhiteboard(
  supabase: Client,
  project: operations.ProjectScope,
  userId: string,
  container: Container,
  text: string,
  title?: string
): Promise<operations.OperationResult<MermaidOutcome>> {
  const parsed = parseMermaid(text)
  if (!parsed.ok) return { error: parsed.error }
  const { diagram } = parsed
  const drawn = drawDiagram(diagram)

  const created = await operations.createDocument(
    supabase,
    project,
    userId,
    "whiteboard",
    container,
    title?.trim() || diagram.title || KIND_TITLES[diagram.kind]
  )
  if ("error" in created) return created
  const whiteboard = { id: created.id, ...project }

  // Half a diagram is worse than none.
  const discard = () =>
    supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", whiteboard.id)
  const pages = await writePages(supabase, whiteboard, drawn.pages)
  if ("error" in pages) {
    await discard()
    return pages
  }
  const nodes = holding(drawn, pages.ids)
  const written = await writeNewDocuments(supabase, [
    {
      documentId: whiteboard.id,
      change: (doc) => {
        for (const node of nodes) nodesMap(doc).set(node.id, stored(node))
        for (const edge of drawn.edges) edgesMap(doc).set(edge.id, stored(edge))
      },
    },
  ])
  if (written.error) {
    await discard()
    return { error: written.error }
  }
  return { ok: true, ...outcome(whiteboard.id, diagram, drawn) }
}

// Adds a diagram to a whiteboard that has things on it already: in free
// space to the right of them, never on top.
export async function addMermaidToWhiteboard(
  supabase: Client,
  whiteboard: { id: string; org_id: string; project_id: string },
  text: string
): Promise<operations.OperationResult<MermaidOutcome>> {
  const parsed = parseMermaid(text)
  if (!parsed.ok) return { error: parsed.error }
  const { diagram } = parsed

  const doc = await loadDocument(supabase, whiteboard.id)
  if (!doc) return { error: "This document could not be read." }
  const taken = [...nodesMap(doc).entries()]
    .map(([id, map]) => readNode(id, map))
    .filter((node) => !node.parentId)
    .map((node) => ({
      x: node.x,
      y: node.y,
      width: node.width ?? DEFAULT_SIZE[node.kind].width ?? 0,
      height: node.height ?? DEFAULT_SIZE[node.kind].height ?? 40,
    }))
  const drawn = drawDiagramBeside(diagram, taken)

  const pages = await writePages(supabase, { id: whiteboard.id, orgId: whiteboard.org_id, projectId: whiteboard.project_id }, drawn.pages)
  if ("error" in pages) return pages
  const nodes = holding(drawn, pages.ids)
  const changed = await changeDocument(supabase, whiteboard.id, (board) => {
    for (const node of nodes) nodesMap(board).set(node.id, stored(node))
    for (const edge of drawn.edges) edgesMap(board).set(edge.id, stored(edge))
  })
  if (changed.error) return { error: changed.error }
  return { ok: true, ...outcome(whiteboard.id, diagram, drawn) }
}
