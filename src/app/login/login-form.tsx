"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { GitHubIcon, GoogleIcon } from "@/components/provider-icons"
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
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-rules"
import { createClient } from "@/lib/supabase/client"

type Provider = "google" | "github"

const PROVIDERS: Record<Provider, { label: string; Icon: (props: React.ComponentProps<"svg">) => React.JSX.Element }> = {
  google: { label: "Google", Icon: GoogleIcon },
  github: { label: "GitHub", Icon: GitHubIcon },
}

// One card, four things to do with it. "link" and "reset" need only an email.
type Mode = "signin" | "signup" | "link" | "reset"

const COPY: Record<Mode, { title: string; description: string; submit: string; pending: string }> = {
  signin: {
    title: "Sign in",
    description: "Welcome back.",
    submit: "Sign in",
    pending: "Signing in…",
  },
  signup: {
    title: "Create an account",
    description: "Free for public projects. No card.",
    submit: "Create account",
    pending: "Creating…",
  },
  link: {
    title: "Sign in with a link",
    description: "We will email you a link that signs you in. No password needed.",
    submit: "Email me a link",
    pending: "Sending…",
  },
  reset: {
    title: "Reset your password",
    description: "We will email you a link to choose a new one.",
    submit: "Send reset link",
    pending: "Sending…",
  },
}

const SENT: Record<Exclude<Mode, "signin">, (email: string) => string> = {
  signup: (email) => `We sent a confirmation link to ${email}. Open it in this browser to finish.`,
  link: (email) => `We sent a sign-in link to ${email}. Open it in this browser.`,
  reset: (email) => `If ${email} has an account, a link to choose a new password is on its way.`,
}

export function LoginForm({
  next,
  providers,
  linkError,
  showLegal,
}: {
  next: string
  providers: Provider[]
  linkError: boolean
  // Whether this server has terms to agree to (see lib/legal).
  showLegal: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState<Exclude<Mode, "signin"> | null>(null)
  const [error, setError] = useState<string | null>(
    linkError ? "That link is invalid or has expired. Request a new one." : null
  )

  const callback = (destination: string) =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`

  function go(to: Mode) {
    setMode(to)
    setError(null)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const auth = createClient().auth

    if (mode === "signin") {
      const { error } = await auth.signInWithPassword({ email, password })
      if (!error) {
        router.replace(next)
        router.refresh()
        return
      }
      setError(error.message)
    } else if (mode === "signup") {
      const { data, error } = await auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callback(next) },
      })
      if (error) setError(error.message)
      // A server that does not confirm emails signs the person in at once.
      else if (data.session) {
        router.replace(next)
        router.refresh()
        return
      } else setSent("signup")
    } else if (mode === "link") {
      const { error } = await auth.signInWithOtp({ email, options: { emailRedirectTo: callback(next) } })
      if (error) setError(error.message)
      else setSent("link")
    } else {
      const { error } = await auth.resetPasswordForEmail(email, {
        redirectTo: callback(`/auth/password?next=${encodeURIComponent(next)}`),
      })
      if (error) setError(error.message)
      else setSent("reset")
    }
    setPending(false)
  }

  async function signInWith(provider: Provider) {
    setError(null)
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback(next) },
    })
    if (error) setError(error.message)
  }

  if (sent) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>{SENT[sent](email)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setSent(null)
              go("signin")
            }}
          >
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    )
  }

  const copy = COPY[mode]
  const withPassword = mode === "signin" || mode === "signup"
  const link = "rounded-sm text-cobalt underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {withPassword && providers.length > 0 && (
          <>
            <div className="flex flex-col gap-2">
              {providers.map((provider) => {
                const { label, Icon } = PROVIDERS[provider]
                return (
                  <Button key={provider} variant="outline" onClick={() => signInWith(provider)}>
                    <Icon />
                    Continue with {label}
                  </Button>
                )
              })}
            </div>
            <div className="flex items-center gap-3 text-xs text-graphite">
              <span className="h-px flex-1 bg-rule" />
              or
              <span className="h-px flex-1 bg-rule" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3">
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
          {withPassword && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                aria-describedby={mode === "signup" ? "password-hint" : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "signup" && (
                <p id="password-hint" className="text-xs text-graphite">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? copy.pending : copy.submit}
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1.5 text-sm text-graphite">
          {mode === "signin" && (
            <>
              <p>
                New to Subcanvas?{" "}
                <button type="button" className={link} onClick={() => go("signup")}>
                  Create an account
                </button>
              </p>
              <p>
                <button type="button" className={link} onClick={() => go("reset")}>
                  Forgot your password?
                </button>
              </p>
              <p>
                <button type="button" className={link} onClick={() => go("link")}>
                  Email me a sign-in link instead
                </button>
              </p>
            </>
          )}
          {mode !== "signin" && (
            <p>
              {mode === "signup" ? "Already have an account? " : ""}
              <button type="button" className={link} onClick={() => go("signin")}>
                {mode === "signup" ? "Sign in" : "Back to sign in"}
              </button>
            </p>
          )}
        </div>

        {showLegal && (
          <p className="border-t border-rule pt-3 text-xs leading-relaxed text-graphite">
            By continuing you agree to the{" "}
            <Link href="/terms" className={link}>
              Terms of Service
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" className={link}>
              Privacy Policy
            </Link>
            .
          </p>
        )}
      </CardContent>
    </Card>
  )
}
