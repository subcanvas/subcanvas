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

import { createInvite } from "./actions"

const INVITE_ROLES = (["viewer", "editor", "admin"] as const).map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
}))

export function InviteForm({ slug, orgId }: { slug: string; orgId: string }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("editor")
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await createInvite(slug, orgId, email, role)
      if ("error" in result) toast.error(result.error)
      else {
        setEmail("")
        toast.success("Invite created. Copy the link to share it.")
      }
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
