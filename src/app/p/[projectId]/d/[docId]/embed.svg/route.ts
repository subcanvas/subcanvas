import { createHash } from "node:crypto"

import type { NextRequest } from "next/server"

import { createAnonymousClient } from "@/lib/supabase/anonymous"
import { loadDocument } from "@/lib/sync/server-document"
import { renderMessageSvg, renderWhiteboardSvg, type SvgTheme } from "@/lib/whiteboard/render-svg"
import { edgesMap, nodesMap, readEdge, readNode } from "@/lib/whiteboard/schema"

// A public whiteboard as a picture, for a README or anywhere else that takes
// an image and not a frame (docs/ROADMAP.md, section 4).
//
// It reads without a session, so row-level security is the check that the
// project is public, the same one the public pages rely on.

// Part of the ETag. Raise it when the renderer's output changes, so caches
// holding the old look let go of it.
const RENDERER_VERSION = 4

// Short, so a change shows up in a README within minutes. GitHub's image
// proxy asks again with If-None-Match, which costs two small queries.
const FRESH = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400"
// A project that was just made public should not stay "private" for long.
const FRESH_MISSING = "public, max-age=60, s-maxage=60"

function svg(body: string | null, status: number, headers: Record<string, string>) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // The image runs nothing and loads nothing, whatever ends up in it.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  })
}

export async function GET(request: NextRequest, context: RouteContext<"/p/[projectId]/d/[docId]/embed.svg">) {
  const { projectId, docId } = await context.params
  const theme: SvgTheme = request.nextUrl.searchParams.get("theme") === "dark" ? "dark" : "light"
  // A self-hosted server signs its embeds with its own name.
  const host = request.nextUrl.host
  const supabase = createAnonymousClient()

  const [{ data: document }, { data: project }, { data: ancestors }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, type")
      .eq("id", docId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("projects").select("id").eq("id", projectId).eq("visibility", "public").maybeSingle(),
    supabase.rpc("document_ancestors", { p_document_id: docId }),
  ])
  const missing =
    !document ||
    !project ||
    document.type !== "whiteboard" ||
    ancestors?.some((ancestor) => ancestor.deleted_at !== null)
  // Still an image: a 404 page would show as a broken picture where a
  // sentence can say why.
  if (missing)
    return svg(renderMessageSvg({ message: "This diagram is private or does not exist", theme, host }), 404, {
      "Cache-Control": FRESH_MISSING,
    })

  // What the picture is made of, without reading the content: if none of it
  // changed, the copy the asker already has is current.
  const [{ data: latest }, { data: snapshot }] = await Promise.all([
    supabase
      .from("document_updates")
      .select("id")
      .eq("document_id", document.id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("document_snapshots").select("updated_at").eq("document_id", document.id).maybeSingle(),
  ])
  const version = [RENDERER_VERSION, latest?.id ?? 0, snapshot?.updated_at ?? "", theme, host, document.title]
  const etag = `"${createHash("sha256").update(JSON.stringify(version)).digest("base64url").slice(0, 27)}"`
  const caching = { "Cache-Control": FRESH, ETag: etag }

  const known = request.headers.get("if-none-match")
  // A proxy that compresses the image marks the tag weak; it is still ours.
  if (known?.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag)) return svg(null, 304, caching)

  const doc = await loadDocument(supabase, document.id)
  if (!doc)
    return svg(renderMessageSvg({ message: "This diagram could not be read", theme, host }), 500, {
      "Cache-Control": "no-store",
    })

  const nodes = [...nodesMap(doc).entries()].map(([id, map]) => readNode(id, map))
  const edges = [...edgesMap(doc).entries()].map(([id, map]) => readEdge(id, map))
  return svg(renderWhiteboardSvg({ nodes, edges, theme, title: document.title, host }), 200, caching)
}
