"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { deleteAccount } from "./actions"

// Asks for the account's email, typed, as deleting a workspace asks for its
// name. Once it is done there is no account to come back to, so it ends on
// the landing page.
export function DeleteAccount({ email, summary }: { email: string; summary: string }) {
  const router = useRouter()
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await deleteAccount(typed)
      if ("error" in result) return setError(result.error)
      toast.success("Your account was deleted.")
      router.push("/")
      router.refresh()
    })
  }

  return (
    <Dialog
      onOpenChange={() => {
        setTyped("")
        setError(null)
      }}
    >
      <DialogTrigger render={<Button variant="destructive">Delete account</Button>} />
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>{summary} It cannot be undone.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-account-email">
              <span>
                Type <span className="font-semibold select-all">{email}</span> to confirm
              </span>
            </Label>
            <Input
              id="delete-account-email"
              type="email"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby="delete-account-hint"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <p id="delete-account-hint" role={error ? "alert" : undefined} className={error ? "text-sm text-destructive" : "text-sm text-graphite"}>
              {error ?? "The email you sign in with."}
            </p>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button type="submit" variant="destructive" disabled={pending || !matches}>
              {pending ? "Deleting…" : "Delete my account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
