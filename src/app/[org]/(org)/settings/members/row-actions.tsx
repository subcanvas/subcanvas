"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { useShowRefusal } from "@/components/limit-refusal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { ROLE_LABELS, ROLES, type Role } from "@/lib/roles"
import { WORKSPACE_HOME } from "@/lib/home"

import {
  changeRole,
  removeMember,
  resendInvite,
  revokeInvite,
  type ActionResult,
} from "./actions"
import { announceInvite } from "./invite-form"

function useAction() {
  const [pending, startTransition] = useTransition()
  const showRefusal = useShowRefusal()

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    startTransition(async () => {
      const result = await action()
      if ("error" in result) showRefusal(result)
      else onOk?.()
    })
  }

  return { pending, run }
}

export function MemberActions({
  slug,
  orgId,
  userId,
  role,
  canManage,
  canGrantOwner,
  canLeave,
}: {
  slug: string
  orgId: string
  userId: string
  role: Role
  canManage: boolean
  canGrantOwner: boolean
  canLeave: boolean
}) {
  const router = useRouter()
  const { pending, run } = useAction()

  const options = ROLES.filter((r) => r !== "owner" || canGrantOwner).map((r) => ({
    value: r,
    label: ROLE_LABELS[r],
  }))

  return (
    <>
      <TableCell>
        {canManage ? (
          <Select
            items={options}
            value={role}
            disabled={pending}
            onValueChange={(next) => {
              if (next && next !== role)
                run(() => changeRole(slug, orgId, userId, next))
            }}
          >
            <SelectTrigger size="sm" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {(canManage || canLeave) && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => removeMember(slug, orgId, userId),
                canLeave ? () => router.push(WORKSPACE_HOME) : undefined
              )
            }
          >
            {canLeave ? "Leave" : "Remove"}
          </Button>
        )}
      </TableCell>
    </>
  )
}

// An open invite offers its link. An expired one offers nothing that leads
// to a dead link: it can be sent again, for 7 more days, or revoked.
export function InviteActions({
  slug,
  inviteId,
  token,
  expired,
}: {
  slug: string
  inviteId: string
  token: string
  expired: boolean
}) {
  const { pending, run } = useAction()
  const [sending, startSending] = useTransition()
  const showRefusal = useShowRefusal()

  // Sending again can meet the editor limit, which is said as everywhere else.
  function sendAgain() {
    startSending(async () => {
      const result = await resendInvite(slug, inviteId)
      if ("error" in result) showRefusal(result)
      else announceInvite(result)
    })
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`)
    toast.success("Invite link copied.")
  }

  return (
    <TableCell className="text-right">
      {expired ? (
        <Button
          variant="outline"
          size="sm"
          disabled={sending}
          onClick={sendAgain}
        >
          {sending ? "Sending…" : "Send again"}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={copyLink}>
          Copy link
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="ml-1"
        disabled={pending || sending}
        onClick={() => run(() => revokeInvite(slug, inviteId))}
      >
        Revoke
      </Button>
    </TableCell>
  )
}
