"use client"

import { useCallback, useEffect, useState } from "react"

import { createClient } from "@/lib/supabase/client"

import { MEDIA_BUCKETS, mediaTypeOf } from "./media"

// The buckets are private, so a file is shown through a signed address that
// Storage itself serves, byte ranges and all: a video can be scrubbed, and
// none of it passes through this app. The address is asked for with the
// reader's own session (or none, on a public page), so row-level security is
// the check, as it is for the whiteboard's content.

// Long enough to watch a video through, short enough that a copied address
// is soon worth nothing.
const SIGNED_FOR_SECONDS = 60 * 60
// An address this close to running out is replaced before it is handed out.
const MARGIN_MS = 5 * 60 * 1000

type Signed = { url: string; expiresAt: number }

const cache = new Map<string, Signed>()
let waiting = new Map<string, ((url: string | null) => void)[]>()
let scheduled = false

// Everything asked for in the same moment (a whiteboard opening with thirty
// pictures on it) goes to Storage as one request per bucket.
async function flush() {
  const batch = waiting
  waiting = new Map()
  scheduled = false

  const supabase = createClient()
  const expiresAt = Date.now() + SIGNED_FOR_SECONDS * 1000
  await Promise.all(
    Object.values(MEDIA_BUCKETS).map(async (bucket) => {
      const paths = [...batch.keys()].filter((path) => MEDIA_BUCKETS[mediaTypeOf(path)] === bucket)
      if (!paths.length) return
      const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_FOR_SECONDS)
      for (const path of paths) {
        // Refused, missing, or the request failed: all the same to the asker.
        const url = data?.find((item) => item.path === path && !item.error)?.signedUrl ?? null
        if (url) cache.set(path, { url, expiresAt })
        batch.get(path)!.forEach((resolve) => resolve(url))
      }
    })
  )
}

function signedUrl(path: string, fresh: boolean) {
  const known = cache.get(path)
  if (!fresh && known && known.expiresAt - Date.now() > MARGIN_MS) return Promise.resolve(known.url)
  return new Promise<string | null>((resolve) => {
    waiting.set(path, [...(waiting.get(path) ?? []), resolve])
    if (scheduled) return
    scheduled = true
    setTimeout(flush, 0)
  })
}

// Whoever just uploaded a picture already has it: showing their own copy
// saves downloading it again. Lasts as long as the tab does.
export function rememberLocalMedia(path: string, objectUrl: string) {
  cache.set(path, { url: objectUrl, expiresAt: Number.POSITIVE_INFINITY })
}

export type MediaUrl = {
  // Null while it is being asked for, and when it cannot be had.
  url: string | null
  failed: boolean
  // For when the address stopped working, as one does after its hour. Asks
  // for another, once: a second failure is the file's, not the address's.
  retry: () => void
}

export function useMediaUrl(path: string | null): MediaUrl {
  const [state, setState] = useState<{ path: string | null; url: string | null; failed: boolean; retried: boolean }>({
    path,
    url: null,
    failed: false,
    retried: false,
  })

  const load = useCallback((wanted: string, fresh: boolean) => {
    let current = true
    void signedUrl(wanted, fresh).then((url) => {
      if (current) setState({ path: wanted, url, failed: url === null, retried: fresh })
    })
    return () => {
      current = false
    }
  }, [])

  useEffect(() => (path ? load(path, false) : undefined), [path, load])

  const retry = useCallback(() => {
    if (!path) return
    if (state.retried) setState((known) => ({ ...known, url: null, failed: true }))
    else {
      cache.delete(path)
      load(path, true)
    }
  }, [path, state.retried, load])

  // An address that belongs to another path is not shown for this one.
  const mine = state.path === path
  return { url: mine ? state.url : null, failed: path === null || (mine && state.failed), retry }
}
