"use client"

import { useActionState, useState } from "react"

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

import { createOrg } from "./actions"

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export function CreateOrgForm() {
  const [state, action, pending] = useActionState(createOrg, null)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Name your org</CardTitle>
        <CardDescription>
          Your projects live in an org, and so do the people you invite later. Just you? Use your own name.
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
              placeholder="Your name, or your team's"
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
            {pending ? "Creating…" : "Create org"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
