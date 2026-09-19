"use client"

import { PanelLeftOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sidebar, useSidebar } from "@/components/ui/sidebar"

// The sidebar on a wide screen. Collapsed, it is a slim rail holding the
// button that brings it back, so nothing has to float over the page.
export function DesktopSidebar({ children }: { children: React.ReactNode }) {
  const { open, toggleSidebar } = useSidebar()

  if (!open)
    return (
      <div className="sticky top-0 hidden h-svh w-11 shrink-0 flex-col items-center border-r border-rule bg-sidebar py-2 md:flex">
        <Button variant="ghost" size="icon" aria-label="Show the sidebar" title="Show the sidebar (⌘\)" onClick={toggleSidebar}>
          <PanelLeftOpen />
        </Button>
      </div>
    )

  return (
    <Sidebar collapsible="none" className="sticky top-0 hidden h-svh border-r border-rule md:flex">
      {children}
    </Sidebar>
  )
}
