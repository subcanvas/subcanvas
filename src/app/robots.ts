import type { MetadataRoute } from "next"
import { headers } from "next/headers"

import { originFromHeaders } from "@/lib/origin"

// Anything that is not a page is off limits (the MCP endpoint, auth
// callbacks, the API, sign-in). Pages stay crawlable on purpose: a public
// project lives at /<workspace>/<project>, beside its members' pages, and
// says `noindex`, and a crawler has to be allowed to fetch a page to see
// that. Blocking them here would let a link from a README put the bare
// address in search results. A member's page sends a crawler to sign in.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = originFromHeaders(await headers())
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/mcp", "/oauth/", "/login", "/onboarding", "/invite/", "/.well-known/"],
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
