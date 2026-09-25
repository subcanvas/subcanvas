import { cn } from "@/lib/utils"

// The whiteboard's paper and dot grid with nothing on them, for the moments
// before a sheet is ready: while the page is fetched, while the whiteboard's
// code loads, and while its first sync arrives. Opening a sheet then goes from
// paper to the drawing, never through a white page. The dots match the
// Background in whiteboard.tsx at 1x: 1.5px across, 20px apart.
export function BlankCanvas({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("bg-paper", className)}
      style={{
        backgroundImage: "radial-gradient(var(--blueline) 0.75px, transparent 0.75px)",
        backgroundSize: "20px 20px",
      }}
    />
  )
}
