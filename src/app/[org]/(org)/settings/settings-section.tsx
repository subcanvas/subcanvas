import { cn } from "@/lib/utils"

// One titled block on a settings page. `danger` is for the blocks whose
// actions cannot be undone, the only place red appears.
export function SettingsSection({
  id,
  title,
  description,
  danger = false,
  children,
}: {
  // Names the heading, so the block is a labelled region.
  id: string
  title: string
  description?: React.ReactNode
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("rounded-xl border bg-sheet", danger ? "border-destructive/40" : "border-rule")}
    >
      <div className={cn("flex flex-col gap-1 border-b px-5 py-4", danger ? "border-destructive/40" : "border-rule")}>
        <h2 id={id} className={cn("text-base font-semibold", danger && "text-destructive")}>
          {title}
        </h2>
        {description && <p className="max-w-xl text-sm leading-relaxed text-graphite">{description}</p>}
      </div>
      <div className="flex flex-col px-5 py-4">{children}</div>
    </section>
  )
}
