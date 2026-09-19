"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-rules"
import { createClient } from "@/lib/supabase/client"

export function PasswordForm({ email, next }: { email: string; next: string }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const { error } = await createClient().auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setPending(false)
      return
    }
    toast.success("Password saved.")
    router.replace(next)
    router.refresh()
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Set a password</CardTitle>
        <CardDescription>For {email}. You can still sign in the other ways.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={submit} className="flex flex-col gap-3">
          {/* Lets a password manager file the new password under the right account. */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="new-password-hint"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p id="new-password-hint" className="text-xs text-graphite">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save password"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
