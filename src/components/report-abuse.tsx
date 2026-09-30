"use client"

import { Flag } from "lucide-react"
import { useParams } from "next/navigation"
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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reportAbuse } from "@/app/p/[projectId]/actions"

// Every public page offers this (R6.7). Reports go to the operator, who is
// emailed each one when the server sends email.
export function ReportAbuse({ projectId }: { projectId: string }) {
  const { docId } = useParams<{ docId?: string }>()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [email, setEmail] = useState("")
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await reportAbuse(projectId, docId ?? null, reason, email)
      if ("error" in result) return void toast.error(result.error)
      toast.success("Thanks. The report was sent.")
      setOpen(false)
      setReason("")
    })
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Flag />
        Report
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Report this project</DialogTitle>
              <DialogDescription>
                Tell us what is wrong: spam, phishing, illegal content, or something private that
                should not be public.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="report-reason">What is wrong?</Label>
              <Textarea
                id="report-reason"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="report-email">Your email (optional, if you want a reply)</Label>
              <Input
                id="report-email"
                type="email"
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline">Cancel</Button>} />
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send report"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
