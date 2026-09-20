"use client"

import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"

import { classifyMedia, fitMedia, layoutMedia, mediaPath, type MediaHome } from "@/lib/whiteboard/media"
import { measureImage, measureVideo, uploadMedia } from "@/lib/whiteboard/media-upload"
import { rememberLocalMedia } from "@/lib/whiteboard/media-urls"
import { newMediaNode, type WbNode } from "@/lib/whiteboard/schema"
import type { useWhiteboard } from "@/lib/whiteboard/use-whiteboard"

// Enough to keep a slow connection busy without starving the whiteboard's
// own traffic.
const AT_ONCE = 3

type Whiteboard = Pick<ReturnType<typeof useWhiteboard>, "showUpload" | "updateUpload" | "addMedia" | "dropUpload">

// Files on their way onto the canvas, however they got here: the toolbar, a
// drop, or a paste. Each shows at once as a placeholder with its progress and
// becomes a real node when its file has arrived. Nothing waits for it: the
// canvas stays usable, and a file that fails takes its placeholder with it.
export function useMediaUploads({
  wb,
  home,
  settle,
  onAdded,
}: {
  wb: Whiteboard
  home: MediaHome
  // Says which group, if any, the finished node lands in.
  settle: (node: WbNode) => WbNode
  onAdded: (ids: string[]) => void
}) {
  const { showUpload, updateUpload, addMedia, dropUpload } = wb

  // Leaving the whiteboard stops what is still uploading: there would be no
  // canvas left to put it on.
  const leaving = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    leaving.current = controller
    return () => controller.abort()
  }, [])

  return useCallback(
    async (files: File[], center: { x: number; y: number }) => {
      const signal = leaving.current?.signal
      if (!signal) return

      const measured = await Promise.all(
        files.map(async (file) => {
          const format = classifyMedia(file)
          if ("error" in format) return { file, error: format.error }
          const objectUrl = URL.createObjectURL(file)
          if (format.mediaType === "video") {
            const natural = await measureVideo(objectUrl)
            URL.revokeObjectURL(objectUrl)
            return { file, format, natural, preview: null }
          }
          const natural = await measureImage(objectUrl)
          if (natural) return { file, format, natural, preview: objectUrl }
          URL.revokeObjectURL(objectUrl)
          return { file, error: "could not be read as a picture." }
        })
      )

      const accepted = measured.flatMap((item) => {
        if (!("error" in item)) return [item]
        toast.error(`${item.file.name} ${item.error}`)
        return []
      })
      const sizes = accepted.map((item) => fitMedia(item.natural))
      const places = layoutMedia(sizes, center)

      const queue = accepted.map((item, index) => {
        const path = mediaPath(home, crypto.randomUUID(), item.format.extension)
        const node = newMediaNode({
          id: crypto.randomUUID(),
          ...places[index],
          ...sizes[index],
          mediaPath: path,
          mediaWidth: item.natural.width,
          mediaHeight: item.natural.height,
        })
        showUpload(node, { progress: 0, preview: item.preview })
        return { ...item, node, path }
      })

      const added: string[] = []
      const next = async (): Promise<void> => {
        const item = queue.shift()
        if (!item) return
        try {
          await uploadMedia(item.file, item.path, {
            signal,
            onProgress: (fraction) => updateUpload(item.node.id, fraction),
          })
          if (item.preview) rememberLocalMedia(item.path, item.preview)
          addMedia(settle(item.node))
          added.push(item.node.id)
          onAdded([...added])
        } catch (error) {
          dropUpload(item.node.id)
          if (item.preview) URL.revokeObjectURL(item.preview)
          if (!signal.aborted)
            toast.error(`${item.file.name} was not added. ${error instanceof Error ? error.message : ""}`.trim())
        }
        return next()
      }
      await Promise.all(Array.from({ length: AT_ONCE }, next))
    },
    [showUpload, updateUpload, addMedia, dropUpload, home, settle, onAdded]
  )
}
