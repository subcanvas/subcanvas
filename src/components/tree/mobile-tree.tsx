"use client"

import { PanelLeft } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

// On a narrow screen the sidebar lives in a drawer, opened from a bar above
// the page, so the page itself gets the full width.
export function MobileTree({
  label = "Documents",
  title,
  description = "The documents in this project.",
  children,
}: {
  label?: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [openAt, setOpenAt] = useState<string | null>(null)
  // Picking a document navigates, and the drawer closes with the old page.
  const open = openAt === pathname

  return (
    <div className="flex items-center gap-2 border-b border-rule bg-sheet px-3 py-1.5 md:hidden">
      <Button variant="ghost" size="sm" onClick={() => setOpenAt(pathname)}>
        <PanelLeft />
        {label}
      </Button>
      <span className="truncate text-sm text-graphite">{title}</span>

      <Sheet open={open} onOpenChange={(next) => setOpenAt(next ? pathname : null)}>
        {/* The close button sits over the top right corner, so a header keeps clear of it. */}
        <SheetContent side="left" className="flex w-72 flex-col gap-0 bg-sidebar p-0 **:data-[slot=sidebar-header]:pr-11">
          <SheetHeader className="sr-only">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    </div>
  )
}
