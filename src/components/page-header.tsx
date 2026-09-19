// The heading block shared by list and settings pages: which org or project
// this is, what the page is, and one line on what it is for.
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        {eyebrow && <p className="font-mono text-xs tracking-wide text-graphite uppercase">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold">{title}</h1>
        {description && <p className="max-w-xl text-sm leading-relaxed text-graphite">{description}</p>}
      </div>
      {action}
    </div>
  )
}
