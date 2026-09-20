"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

// Matches the `md` breakpoint the settings layout switches at. The server
// cannot know the screen's width, so this is decided in the browser.
const WIDE = "(min-width: 48rem)"

export function OpenFirstSection({ href }: { href: string }) {
  const router = useRouter()

  useEffect(() => {
    if (window.matchMedia(WIDE).matches) router.replace(href)
  }, [router, href])

  return null
}
