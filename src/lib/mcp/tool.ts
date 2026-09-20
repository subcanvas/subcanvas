import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import type { Database } from "@/lib/supabase/database.types"

// One MCP tool, described as data. The server registers the list, the
// "Connect an agent" page prints it, and the parity test reads `covers` to
// check that every server action has a tool (docs/ROADMAP.md, section 2).

export type ToolContext = {
  // Carries the caller's token, so row-level security decides everything.
  supabase: SupabaseClient<Database>
  userId: string
  // Where this deployment is served from, for links in results.
  origin: string
}

// `text` is what a model reads; `data` is the same result for code.
export type ToolResult = { error: string } | { text: string; data: Record<string, unknown> }

export type ToolGroup = "Orgs and projects" | "Documents" | "Text documents" | "Whiteboards" | "GitHub and embeds"

export type Tool = {
  name: string
  title: string
  group: ToolGroup
  description: string
  input: z.ZodObject<z.ZodRawShape>
  annotations: {
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }
  // The server actions this tool does the work of, as "<file>.<export>".
  covers: string[]
  run: (context: ToolContext, args: unknown) => Promise<ToolResult>
}

type Kind = "read" | "write" | "idempotent-write" | "destructive"

// The hints, said once. A read changes nothing. A write adds or changes
// something and can be repeated only when marked idempotent. Destructive
// means something a person made can stop being there.
const ANNOTATIONS: Record<Kind, Omit<Tool["annotations"], "openWorldHint">> = {
  read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  write: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  "idempotent-write": { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  destructive: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
}

export function defineTool<Shape extends z.ZodRawShape>(tool: {
  name: string
  title: string
  group: ToolGroup
  description: string
  input: Shape
  kind: Kind
  // True when the tool reaches outside Subcanvas, such as to GitHub.
  openWorld?: boolean
  covers?: string[]
  run: (context: ToolContext, args: z.infer<z.ZodObject<Shape>>) => Promise<ToolResult>
}): Tool {
  return {
    name: tool.name,
    title: tool.title,
    group: tool.group,
    description: tool.description,
    input: z.object(tool.input),
    annotations: { ...ANNOTATIONS[tool.kind], openWorldHint: tool.openWorld ?? false },
    covers: tool.covers ?? [],
    // The server validates the arguments against `input` before it calls.
    run: (context, args) => tool.run(context, args as z.infer<z.ZodObject<Shape>>),
  }
}

export const id = (what: string) => z.string().uuid().describe(what)
