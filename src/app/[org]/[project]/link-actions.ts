"use server"

import { previewLink, type LinkPreview } from "@/lib/links/preview"
import { createClient } from "@/lib/supabase/server"
import type { MediaHome } from "@/lib/whiteboard/media"
import { parseLinkUrl } from "@/lib/whiteboard/schema"

// What a link card shows (lib/links/preview.ts), for a link pasted on a
// whiteboard. Its picture is stored under the whiteboard as the person who
// pasted it, so only someone who may add pictures there gets one.
export async function readLinkCard(home: MediaHome, address: string): Promise<LinkPreview | { error: string }> {
  const url = parseLinkUrl(address)
  if (!url) return { error: "That is not a web address." }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You are signed out. Sign in and try again." }
  return previewLink(supabase, home, url)
}
