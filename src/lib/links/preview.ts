import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { MEDIA_BUCKETS, MEDIA_MAX_BYTES, mediaPath, type MediaHome } from "@/lib/whiteboard/media"

import { fetchPublic } from "./fetch"
import { readPage, youtubeId } from "./page"

// A link card's contents: what the page says it is, read once when the card
// is made, and its picture, copied into the whiteboard's own pictures. So
// nobody who looks at the card later loads anything from the page's site,
// and the card stays as it was if the page changes or goes.

export type LinkPreview = {
  url: string
  title: string
  description: string
  site: string
  // The picture, stored with the whiteboard's others, when the page has one
  // this app keeps (mediaPath in lib/whiteboard/media.ts).
  mediaPath: string | null
}

const PAGE_BYTES = 768 * 1024
const PICTURES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

type Picture = { bytes: Buffer; extension: string; contentType: string }

async function picture(address: string | null): Promise<Picture | null> {
  if (!address) return null
  try {
    const fetched = await fetchPublic(address, { accept: Object.keys(PICTURES).join(", "), maxBytes: MEDIA_MAX_BYTES.image })
    const contentType = fetched.contentType.split(";")[0].trim().toLowerCase()
    const extension = PICTURES[contentType]
    if (!extension || fetched.truncated || !fetched.body.length) return null
    return { bytes: fetched.body, extension, contentType }
  } catch {
    return null
  }
}

// What the page at `address` says it is, and its picture. Never throws for
// a page that cannot be read: the card then shows the address and its site.
export async function readLink(address: string): Promise<{ facts: Omit<LinkPreview, "mediaPath">; picture: Picture | null }> {
  const host = (() => {
    try {
      return new URL(address).hostname.replace(/^www\./, "")
    } catch {
      return address
    }
  })()
  const plain = { facts: { url: address, title: host, description: "", site: host }, picture: null }

  const video = youtubeId(address)
  if (video) {
    // YouTube's own description of the video, which its pages may not give
    // a stranger, and its thumbnail, which every video has.
    let title = "YouTube video"
    let site = "YouTube"
    try {
      const oembed = await fetchPublic(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${video}`)}`,
        { accept: "application/json", maxBytes: 64 * 1024 }
      )
      const data = JSON.parse(oembed.body.toString("utf8")) as { title?: string; author_name?: string }
      if (data.title) title = data.title.slice(0, 200)
      if (data.author_name) site = `YouTube · ${data.author_name.slice(0, 60)}`
    } catch {
      // The card still plays the video; it is only without its name.
    }
    return {
      facts: { url: address, title, description: "", site },
      picture: await picture(`https://i.ytimg.com/vi/${video}/hqdefault.jpg`),
    }
  }

  try {
    const page = await fetchPublic(address, { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", maxBytes: PAGE_BYTES })
    const type = page.contentType.split(";")[0].trim().toLowerCase()
    // A link to a picture is its own picture.
    if (PICTURES[type] && !page.truncated)
      return { facts: { ...plain.facts, url: page.url }, picture: { bytes: page.body, extension: PICTURES[type], contentType: type } }
    if (type && type !== "text/html" && type !== "application/xhtml+xml") return plain
    const facts = readPage(page.body.toString("utf8"), page.url)
    return {
      facts: { url: address, title: facts.title, description: facts.description, site: facts.site },
      picture: await picture(facts.image),
    }
  } catch {
    // Unreachable, refused (a private address, LinkFetchError), or too slow.
    return plain
  }
}

// The card's contents, with its picture stored under `home` as the person
// whose client this is: row-level security and the storage limits decide,
// as for a picture they upload themselves. A picture that cannot be stored
// (the storage limit, say) leaves the card without one.
export async function previewLink(
  supabase: SupabaseClient<Database>,
  home: MediaHome,
  address: string
): Promise<LinkPreview> {
  const { facts, picture: found } = await readLink(address)
  if (!found) return { ...facts, mediaPath: null }
  const path = mediaPath(home, crypto.randomUUID(), found.extension)
  const { error } = await supabase.storage.from(MEDIA_BUCKETS.image).upload(path, found.bytes, {
    contentType: found.contentType,
    cacheControl: "31536000",
    upsert: false,
  })
  return { ...facts, mediaPath: error ? null : path }
}
