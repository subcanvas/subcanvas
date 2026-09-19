"use client"

import { Eye } from "lucide-react"
import { useEffect } from "react"

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SupabaseProvider } from "@/lib/sync/supabase-provider"
import { useSyncStatus } from "@/lib/sync/use-document-sync"

import type { EditorUser } from "./text-editor"

const MAX_SHOWN = 4

// Announces this person in the document and shows who else is here (R5.2).
export function PresenceAvatars({
  provider,
  user,
}: {
  provider: SupabaseProvider
  user: EditorUser
}) {
  const { peers, viewers } = useSyncStatus(provider)

  useEffect(() => {
    provider.setUser({ id: user.id, name: user.name, color: user.color })
  }, [provider, user.id, user.name, user.color])

  const watching = viewers > 0 && (
    <span
      className="flex items-center gap-1 text-xs text-muted-foreground"
      title="People viewing without editing. Updates every few seconds."
    >
      <Eye className="size-3.5" aria-hidden />
      {viewers} watching
    </span>
  )

  if (!peers.length) return watching || null

  return (
    <>
      <AvatarGroup aria-label={`${peers.length} other ${peers.length === 1 ? "person" : "people"} here`}>
        {peers.slice(0, MAX_SHOWN).map((peer) => (
          <Tooltip key={peer.id}>
            <TooltipTrigger
              render={
                <Avatar className="size-6 ring-2 ring-background">
                  <AvatarFallback
                    className="text-xs font-medium text-white"
                    style={{ backgroundColor: peer.color }}
                  >
                    {peer.name.charAt(0).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
              }
            />
            <TooltipContent>{peer.name}</TooltipContent>
          </Tooltip>
        ))}
        {peers.length > MAX_SHOWN && <AvatarGroupCount>+{peers.length - MAX_SHOWN}</AvatarGroupCount>}
      </AvatarGroup>
      {watching}
    </>
  )
}
