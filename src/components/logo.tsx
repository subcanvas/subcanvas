import { cn } from "@/lib/utils"

// A sheet inside a sheet.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5", className)}>
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="9" height="9" rx="2" fill="var(--cobalt)" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-heading text-[1.05rem] font-semibold tracking-tight", className)}>
      <LogoMark />
      Subcanvas
    </span>
  )
}
