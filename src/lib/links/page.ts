// What a link preview shows, read from a page's <head>: its Open Graph and
// Twitter card tags, else its <title> and description. Pure, so it can be
// tested on fixed HTML. And the YouTube video a link is to, if any.

export type PageFacts = { title: string; description: string; site: string; image: string | null }

const MAX_TITLE = 200
const MAX_DESCRIPTION = 300

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const value = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

const clean = (text: string, max: number) => {
  const plain = decodeEntities(text).replace(/\s+/g, " ").trim()
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}

// Every <meta> tag's attributes, by its property or name, lowercased.
function metaTags(head: string) {
  const tags = new Map<string, string>()
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>()
    // The groups: 3 is a double-quoted value, 4 single-quoted, 5 bare.
    for (const [, name, , double, single, bare] of tag.matchAll(/([a-z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi))
      attributes.set(name.toLowerCase(), double ?? single ?? bare ?? "")
    const key = (attributes.get("property") ?? attributes.get("name") ?? attributes.get("itemprop"))?.toLowerCase()
    const content = attributes.get("content")
    if (key && content !== undefined && !tags.has(key)) tags.set(key, content)
  }
  return tags
}

export function readPage(html: string, pageUrl: string): PageFacts {
  // The head, or as much as came: tags after it are the body's own.
  const head = html.slice(0, Math.max(html.search(/<\/head>/i), 0) || html.length)
  const tags = metaTags(head)
  const pick = (...keys: string[]) => keys.map((key) => tags.get(key)).find((value) => value?.trim())
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]

  const host = (() => {
    try {
      return new URL(pageUrl).hostname.replace(/^www\./, "")
    } catch {
      return ""
    }
  })()

  let image: string | null = null
  const written = pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src")
  if (written) {
    try {
      const resolved = new URL(decodeEntities(written.trim()), pageUrl)
      if (resolved.protocol === "https:" || resolved.protocol === "http:") image = resolved.href
    } catch {
      image = null
    }
  }

  return {
    title: clean(pick("og:title", "twitter:title") ?? titleTag ?? "", MAX_TITLE) || host,
    description: clean(pick("og:description", "twitter:description", "description") ?? "", MAX_DESCRIPTION),
    site: clean(pick("og:site_name") ?? "", 80) || host,
    image,
  }
}

// The video a YouTube link is to: youtube.com/watch?v=, youtu.be/, and the
// /shorts/, /embed/ and /live/ addresses. Ids are 11 characters.
export function youtubeId(address: string) {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "")
  let id: string | null = null
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0]
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v")
    else id = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null
}
