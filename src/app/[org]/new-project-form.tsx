"use client"

import { Globe, Lock, Plus } from "lucide-react"
import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { createProject } from "./actions"

const CHOICES = [
  {
    value: "private",
    label: "Private",
    icon: Lock,
    detail: "Only members of your org can see it.",
  },
  {
    value: "public",
    label: "Public",
    icon: Globe,
    detail: "Anyone with the link can read it. Only members can edit. Public documents are unlimited on the free plan.",
  },
] as const

export function NewProject({ slug, orgId }: { slug: string; orgId: string }) {
  const [state, action, pending] = useActionState(createProject.bind(null, slug, orgId), null)
  const [visibility, setVisibility] = useState<"private" | "public">("private")

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            New project
          </Button>
        }
      />
      <DialogContent>
        <form action={action} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>You can change who sees it later.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" name="name" required maxLength={120} autoFocus placeholder="Platform, Trip to Lisbon, Biology 101" />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Who can see it</legend>
            <input type="hidden" name="visibility" value={visibility} />
            <div role="radiogroup" aria-label="Who can see it" className="grid gap-2 sm:grid-cols-2">
              {CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={visibility === choice.value}
                  onClick={() => setVisibility(choice.value)}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    visibility === choice.value ? "border-cobalt bg-accent" : "border-rule hover:border-input"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <choice.icon className="size-3.5" aria-hidden />
                    {choice.label}
                  </span>
                  <span className="text-xs leading-relaxed text-graphite">{choice.detail}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
