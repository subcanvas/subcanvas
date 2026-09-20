"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { adoptProviderPicture, updateDisplayName, updatePicture, type ActionResult } from "./actions"
import { PROVIDER_LABELS, type PictureProvider } from "./identities"

export function DisplayNameForm({ initial, email }: { initial: string; email: string }) {
  const [saved, setSaved] = useState(initial)
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updateDisplayName(name)
      if ("error" in result) return setError(result.error)
      setSaved(name.trim())
      setName(name.trim())
      toast.success("Name saved.")
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="display-name">Display name</Label>
      <div className="flex gap-2">
        <Input
          id="display-name"
          className="max-w-sm"
          maxLength={80}
          autoComplete="name"
          placeholder={email}
          aria-invalid={error ? true : undefined}
          aria-describedby="display-name-hint"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={pending || name.trim() === saved}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {/* The hint and the error share one line, so an error moves nothing. */}
      <p id="display-name-hint" role={error ? "alert" : undefined} className={error ? "text-sm text-destructive" : "text-sm text-graphite"}>
        {error ?? "Leave it empty to show your email instead."}
      </p>
    </form>
  )
}

export function PictureForm({
  initial,
  fallback,
  providers,
}: {
  initial: string | null
  // The letter shown when there is no picture.
  fallback: string
  // The connected accounts that have a picture to offer.
  providers: { provider: PictureProvider; picture: string }[]
}) {
  // What the avatar shows. It changes as soon as something is chosen and
  // goes back if the save fails.
  const [picture, setPicture] = useState(initial)
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(next: string | null, action: () => Promise<ActionResult>, done: string) {
    const previous = picture
    setError(null)
    setPicture(next)
    startTransition(async () => {
      const result = await action()
      if ("error" in result) {
        setPicture(previous)
        return setError(result.error)
      }
      setUrl("")
      toast.success(done)
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    save(url.trim(), () => updatePicture(url), "Picture saved.")
  }

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <Avatar className="size-16">
        {picture && <AvatarImage src={picture} alt="" />}
        <AvatarFallback className="text-xl">{fallback}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Always here, so choosing or removing a picture moves nothing. */}
        <div className="flex flex-wrap gap-2">
          {providers.map(({ provider, picture: theirs }) => (
            <Button
              key={provider}
              variant="outline"
              disabled={pending || picture === theirs}
              onClick={() => save(theirs, () => adoptProviderPicture(provider), "Picture saved.")}
            >
              Use my {PROVIDER_LABELS[provider]} picture
            </Button>
          ))}
          <Button
            variant="outline"
            disabled={pending || !picture}
            onClick={() => save(null, () => updatePicture(null), "Picture removed.")}
          >
            Remove picture
          </Button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2">
          <Label htmlFor="picture-url">Picture address</Label>
          <div className="flex gap-2">
            <Input
              id="picture-url"
              type="url"
              className="max-w-sm"
              placeholder="https://example.com/me.png"
              pattern="https://.*"
              maxLength={2048}
              aria-invalid={error ? true : undefined}
              aria-describedby="picture-url-hint"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" disabled={pending || !url.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
          <p id="picture-url-hint" role={error ? "alert" : undefined} className={error ? "text-sm text-destructive" : "text-sm text-graphite"}>
            {error ?? "A link to a picture that is already online, starting with https://. Uploading one is not possible yet."}
          </p>
        </form>
      </div>
    </div>
  )
}
