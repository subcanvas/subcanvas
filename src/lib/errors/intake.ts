import { z } from "zod"

import { requestOrigin } from "@/lib/origin"

import { MAX_MESSAGE, MAX_NAME, type ErrorReport } from "./normalize"

// What the browser route (app/api/errors) accepts: a page of this site, a
// small body, a few a minute from one address. The address is used for the
// limit, in this process's memory, and never stored or passed on.

export const MAX_BODY_BYTES = 16_384
export const PER_MINUTE = 20

const reportSchema = z.object({
  name: z.string().max(MAX_NAME),
  message: z.string().max(MAX_MESSAGE * 2),
  stack: z.string().max(MAX_BODY_BYTES).nullish(),
  route: z.string().max(400),
})

export type Intake = { report: ErrorReport } | { status: 400 | 403 | 413 | 429; error: string }

export async function receiveReport(request: Request, now = Date.now()): Promise<Intake> {
  if (!sameOrigin(request)) return { status: 403, error: "Same origin only." }
  if (limited(clientAddress(request), now)) return { status: 429, error: "Too many reports." }

  const declared = Number(request.headers.get("content-length"))
  if (declared > MAX_BODY_BYTES) return { status: 413, error: "Too large." }
  const body = await readCapped(request, MAX_BODY_BYTES)
  if (body === null) return { status: 413, error: "Too large." }

  try {
    return { report: { source: "browser", ...reportSchema.parse(JSON.parse(body)) } }
  } catch {
    return { status: 400, error: "Not an error report." }
  }
}

// A page of this site, and nothing else: the Origin a browser puts on every
// POST, or, where it leaves it out, its own word that the request is from
// this site.
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (origin) return origin === requestOrigin(request)
  return request.headers.get("sec-fetch-site") === "same-origin"
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown"
}

// Reports from each address in the current minute.
const recent = new Map<string, number>()
let minute = 0

function limited(address: string, now: number) {
  const current = Math.floor(now / 60_000)
  if (current !== minute) {
    recent.clear()
    minute = current
  }
  const count = (recent.get(address) ?? 0) + 1
  recent.set(address, count)
  return count > PER_MINUTE
}

// The body as text, or null once it is longer than `max` bytes, without
// reading the rest.
async function readCapped(request: Request, max: number) {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
