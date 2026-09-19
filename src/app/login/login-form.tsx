"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"

type Provider = "google" | "github"

const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Google",
  github: "GitHub",
}

export function LoginForm({
  next,
  providers,
  linkError,
}: {
  next: string
  providers: Provider[]
  linkError: boolean
}) {
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(
    linkError ? "That sign-in link is invalid or has expired. Request a new one." : null
  )

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  async function sendLink(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    })
    setPending(false)
    if (error) setError(error.message)
    else setSentTo(email)
  }

  async function signInWith(provider: Provider) {
    setError(null)
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo() },
    })
    if (error) setError(error.message)
  }

  if (sentTo) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a sign-in link to {sentTo}. Open it in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in to Graph Notes</CardTitle>
        <CardDescription>We will email you a link. No password needed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>

        {providers.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              {providers.map((provider) => (
                <Button
                  key={provider}
                  variant="outline"
                  onClick={() => signInWith(provider)}
                >
                  Continue with {PROVIDER_LABELS[provider]}
                </Button>
              ))}
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
