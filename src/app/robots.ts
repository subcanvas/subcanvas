import type { MetadataRoute } from "next"
import { headers } from "next/headers"

import { originFromHeaders } from "@/lib/mcp/origin"

// Everything behind a sign-in is off limits, and so is anything that is not
// a page (the MCP endpoint, auth callbacks, the API). Public projects stay
// crawlable on purpose: their pages say `noindex`, and a crawler has to be
// allowed to fetch a page to see that. Blocking them here would let a link
// from a README put the bare address in search results.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = originFromHeaders(await headers())
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/terms", "/privacy", "/p/", "/_next/", "/brand/", "/opengraph-image"],
      disallow: "/",
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
