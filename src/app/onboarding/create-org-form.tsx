"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useActionState, useState } from "react"

import { SignOutButton } from "@/components/sign-out-button"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { createOrg } from "./actions"

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "")
}

export function CreateOrgForm({ back, email }: { back: { href: string; label: string }; email: string }) {
  const [state, action, pending] = useActionState(createOrg, null)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>New team workspace</CardTitle>
        <CardDescription>
          A workspace to share: invite people, give each of them a role, and work on the same projects. Your
          personal workspace stays yours alone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={80}
              placeholder="Your team's name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!slugEdited) setSlug(slugify(e.target.value))
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">Web address</Label>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>/</span>
              <Input
                id="slug"
                name="slug"
                required
                maxLength={40}
                placeholder="acme"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setSlugEdited(true)
                }}
              />
            </div>
          </div>
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 text-sm">
        <Link
          href={back.href}
          className="-ml-0.5 flex items-center gap-1 rounded-md text-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
        <p className="text-graphite">
          Signed in as {email}. <SignOutButton />
        </p>
      </CardFooter>
    </Card>
  )
}
