"use client"

import { FileText, Link2, Workflow } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { documentHref } from "@/lib/navigation"

export type Reference = {
  id: string
  title: string
  type: "text" | "whiteboard"
  projectId: string
}

// Every other place this document appears (R1.7).
export function ReferencedBy({ slug, references }: { slug: string; references: Reference[] }) {
  if (!references.length) return null

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Link2 />
            Linked from {references.length}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Linked from</PopoverTitle>
        </PopoverHeader>
        <ul className="flex flex-col">
          {references.map((reference) => {
            const Icon = reference.type === "whiteboard" ? Workflow : FileText
            return (
              <li key={reference.id}>
                <Link
                  href={documentHref({ slug, projectId: reference.projectId }, reference.id)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{reference.title}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
