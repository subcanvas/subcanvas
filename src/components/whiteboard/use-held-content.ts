"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"

import { useShowRefusal } from "@/components/limit-refusal"
import { restoreHeldDocuments, trashHeldDocuments } from "@/lib/documents/held"
import { createClient } from "@/lib/supabase/client"
import type { WhiteboardContext } from "@/lib/whiteboard/description-document"
import type { ObjectsChange } from "@/lib/whiteboard/use-whiteboard"

import { mediaRemoved, mediaReturned, whiteboardOpened } from "./media-release"

// What the objects on this canvas held follows them. A box or an arrow
// deleted here sends its description, or the whiteboard inside it, to the
// trash with everything nested in it (lib/documents/held.ts); undo brings
// back exactly what that deletion sent, and redo sends it again. The files
// of deleted pictures and videos wait until undo can no longer bring them
// back (media-release.ts).
export function useHeldContent(context: WhiteboardContext) {
  const router = useRouter()
  const showRefusal = useShowRefusal()
  const { whiteboardId } = context
  // The documents each deleted object took to the trash, by object id.
  const trashed = useRef(new Map<string, string[]>())
  // One after another: an undo waits for the deletion it undoes.
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => whiteboardOpened(whiteboardId), [whiteboardId])

  return useCallback(
    ({ removed, returned }: ObjectsChange) => {
      const files = (objects: ObjectsChange["removed"]) => objects.flatMap((object) => object.mediaPath ?? [])
      mediaRemoved(whiteboardId, files(removed))
      mediaReturned(whiteboardId, files(returned))

      queue.current = queue.current.then(async () => {
        const supabase = createClient()
        let changed = false

        if (removed.length) {
          const result = await trashHeldDocuments(supabase, whiteboardId, removed.map((object) => object.id))
          if ("error" in result) showRefusal(result)
          else if (result.documents.length) {
            for (const document of result.documents) {
              const objectId = document.parent_object_id!
              trashed.current.set(objectId, [...(trashed.current.get(objectId) ?? []), document.id])
            }
            changed = true
            const one = result.documents.length === 1
            toast(`${result.documents.map((document) => `“${document.title}”`).join(", ")} ${one ? "is" : "are"} in the trash`, {
              description: `${one ? "It was" : "They were"} inside what you deleted. Undo brings ${one ? "it" : "them"} back.`,
            })
          }
        }

        const back = returned.flatMap((object) => trashed.current.get(object.id) ?? [])
        for (const object of returned) trashed.current.delete(object.id)
        if (back.length) {
          const result = await restoreHeldDocuments(supabase, back)
          if ("error" in result) showRefusal(result)
          else changed = true
        }

        // The sidebar tree shows whiteboards held by boxes.
        if (changed) router.refresh()
      })
    },
    [router, showRefusal, whiteboardId]
  )
}
