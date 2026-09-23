import type { MetadataRoute } from "next"
import { headers } from "next/headers"

import { legalDetails } from "@/lib/legal"
import { originFromHeaders } from "@/lib/origin"

// The pages worth finding by search. Everything else is someone's work, and
// behind a sign-in or marked `noindex`.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = originFromHeaders(await headers())
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    ...(legalDetails()
      ? [
          { url: `${origin}/terms`, changeFrequency: "yearly" as const, priority: 0.2 },
          { url: `${origin}/privacy`, changeFrequency: "yearly" as const, priority: 0.2 },
        ]
      : []),
  ]
}
