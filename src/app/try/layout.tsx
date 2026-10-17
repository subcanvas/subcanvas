import type { Metadata } from "next"

import { Playground } from "@/components/playground/playground"

export const metadata: Metadata = {
  title: "Playground",
  description: "Try Subcanvas without an account: an example system design, or a course laid out as notes, whose boxes open into whiteboards and pages, kept in your browser.",
}

// Kept across the playground's pages, so moving between them keeps the
// documents open (components/playground).
export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return <Playground>{children}</Playground>
}
