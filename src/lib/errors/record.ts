import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import { normalizeError, type ErrorReport } from "./normalize"

// Writes an error report to the database (migration error_reports) with the
// server's secret key. Without the key nothing is written, and the caller's
// log line is all there is. Never throws: a report that could not be
// written is logged and forgotten, so reporting an error cannot make one.
//
// Not lib/supabase/admin.ts: that one is for server code inside a request,
// and this also runs from instrumentation.ts.

export type RecordOutcome = "new" | "counted" | "refused" | "off" | "failed"

export async function recordError(report: ErrorReport, { dailyNewLimit }: { dailyNewLimit?: number } = {}): Promise<RecordOutcome> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return "off"
  try {
    const error = await normalizeError(report)
    const admin = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error: failure } = await admin.rpc("record_error", {
      p_fingerprint: error.fingerprint,
      p_source: error.source,
      p_name: error.name,
      p_message: error.message,
      p_stack: error.stack as string,
      p_route: error.route,
      p_release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 40),
      p_daily_new_limit: dailyNewLimit,
    })
    if (failure) {
      console.error("Recording an error report failed:", failure.message)
      return "failed"
    }
    return data as RecordOutcome
  } catch (failure) {
    console.error("Recording an error report failed:", failure)
    return "failed"
  }
}

type RequestContext = { get(): { waitUntil?: (promise: Promise<unknown>) => void } | undefined }

// Lets work finish after the response without holding it up: on Vercel
// through the request's waitUntil (what `after` uses), elsewhere the process
// simply goes on running it.
export function inBackground(work: Promise<unknown>) {
  const context = (globalThis as Record<symbol, RequestContext | undefined>)[Symbol.for("@next/request-context")]
  context?.get()?.waitUntil?.(work)
}
