"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

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

import {
  changeRole,
  removeMember,
  revokeInvite,
  type ActionResult,
} from "./actions"

function useAction() {
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    startTransition(async () => {
      const result = await action()
      if ("error" in result) toast.error(result.error)
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
                canLeave ? () => router.push("/") : undefined
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

export function InviteActions({
  slug,
  inviteId,
  token,
}: {
  slug: string
  inviteId: string
  token: string
}) {
  const { pending, run } = useAction()

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`)
    toast.success("Invite link copied.")
  }

  return (
    <TableCell className="text-right">
      <Button variant="outline" size="sm" onClick={copyLink}>
        Copy link
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="ml-1"
        disabled={pending}
        onClick={() => run(() => revokeInvite(slug, inviteId))}
      >
        Revoke
      </Button>
    </TableCell>
  )
}
