"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ROLE_LABELS, type Role } from "@/lib/roles"

import { createInvite, type InviteResult } from "./actions"

// create_invite in the database lets each person email this many a day.
const INVITE_EMAILS_A_DAY = 50

const INVITE_ROLES = (["viewer", "editor", "admin"] as const).map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
}))

// Says what became of an invite, and of its email. When the email did not
// go, the invite is there all the same, and its row has the link to copy.
export function announceInvite(result: InviteResult) {
  if ("error" in result) return void toast.error(result.error)
  const { email, renewed, delivery } = result
  const made = renewed ? "renewed for 7 days" : "created"
  if (delivery === "sent")
    toast.success(renewed ? `Invite sent again to ${email}, for 7 more days.` : `Invite emailed to ${email}.`)
  else if (delivery === "off") toast.success(`Invite ${made}. Copy its link and send it to ${email}.`)
  else if (delivery === "failed")
    toast.warning(`Invite ${made}, but the email to ${email} did not go. Copy its link and send it yourself.`, {
      duration: 10_000,
    })
  else
    toast.warning(
      `Invite ${made}. You have emailed ${INVITE_EMAILS_A_DAY} invites in the last 24 hours, the most allowed, so copy its link and send it yourself.`,
      { duration: 10_000 }
    )
}

export function InviteForm({ slug, orgId }: { slug: string; orgId: string }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("editor")
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await createInvite(slug, orgId, email, role)
      announceInvite(result)
      if (!("error" in result)) setEmail("")
    })
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        type="email"
        required
        aria-label="Email"
        placeholder="teammate@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Select
        items={INVITE_ROLES}
        value={role}
        onValueChange={(next) => next && setRole(next)}
      >
        <SelectTrigger aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INVITE_ROLES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
    </form>
  )
}
