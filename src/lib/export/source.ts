import { createClient } from "@/lib/supabase/client"
import { MEDIA_BUCKETS, mediaTypeOf } from "@/lib/whiteboard/media"

import type { ExportedDocument, ProjectExport } from "./read"
import type { ExportSource } from "./zip"

// Where the browser gets a project's export from: the app for the documents,
// Storage for the files. Both are asked as the person in this tab, or as
// nobody on a public page, so the export holds what they can read.

export class ExportError extends Error {}

// Long enough to fetch a batch's files one after another.
const SIGNED_FOR_SECONDS = 60 * 60

export function exportSource(projectId: string, signal: AbortSignal): ExportSource {
  const base = `/api/projects/${projectId}/export`
  return {
    async project() {
      const response = await fetch(base, { signal, cache: "no-store" })
      if (!response.ok)
        throw new ExportError(
          response.status === 404 ? "This project could not be found, or you cannot read it." : "The project could not be read. Try again."
        )
      return (await response.json()) as ProjectExport
    },

    // One line of JSON per document, read as it arrives.
    async *documents(ids) {
      const response = await fetch(`${base}/documents?ids=${ids.join(",")}`, { signal, cache: "no-store" })
      if (!response.ok || !response.body) throw new ExportError("The documents could not be read.")
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffered = ""
      for (;;) {
        const { value, done } = await reader.read()
        if (value) buffered += value
        const lines = buffered.split("\n")
        buffered = done ? "" : lines.pop()!
        for (const line of lines) if (line.trim()) yield JSON.parse(line) as ExportedDocument
        if (done) return
      }
    },

    async sign(paths) {
      const supabase = createClient()
      const signed = new Map<string, string | null>(paths.map((path) => [path, null]))
      await Promise.all(
        Object.values(MEDIA_BUCKETS).map(async (bucket) => {
          const inBucket = paths.filter((path) => MEDIA_BUCKETS[mediaTypeOf(path)] === bucket)
          if (!inBucket.length) return
          const { data } = await supabase.storage.from(bucket).createSignedUrls(inBucket, SIGNED_FOR_SECONDS)
          for (const item of data ?? []) if (item.path && !item.error) signed.set(item.path, item.signedUrl)
        })
      )
      return signed
    },

    async download(url) {
      try {
        const response = await fetch(url, { signal })
        return response.ok ? await response.blob() : null
      } catch (error) {
        if (signal.aborted) throw error
        return null
      }
    },
  }
}
