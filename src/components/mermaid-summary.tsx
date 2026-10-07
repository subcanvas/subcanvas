import type { ParseResult } from "@/lib/mermaid/diagram"

const KINDS = { flowchart: "A flowchart", sequence: "A sequence diagram", er: "An ER diagram" }

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Words in backticks are Mermaid's own, and are shown as code.
function Words({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
      <code key={index} className="rounded-[3px] bg-sheet px-1 font-mono text-[11px] text-ink">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    )
  )
}

// What a piece of Mermaid will become, said before anything is made: how
// many boxes, groups and arrows, and everything that will not be drawn as
// written. Or why it cannot be drawn at all.
export function MermaidSummary({ parsed }: { parsed: ParseResult }) {
  if (!parsed.ok)
    return (
      <p role="alert" className="text-sm text-ink">
        <Words text={parsed.error} />
      </p>
    )
  const { diagram } = parsed
  const arrows = diagram.arrows.filter((arrow) => !arrow.hidden).length
  return (
    <div role="status" className="flex flex-col gap-2 text-sm">
      <p className="text-ink">
        {KINDS[diagram.kind]}
        {diagram.title && <> named “{diagram.title}”</>}: {count(diagram.boxes.length, "box", "boxes")}
        {diagram.groups.length > 0 && <> in {count(diagram.groups.length, "group")}</>} and {count(arrows, "arrow")}.
      </p>
      {diagram.notes.length > 0 && (
        <ul
          aria-label="Not drawn as written"
          className="flex max-h-32 flex-col gap-1.5 overflow-y-auto rounded-lg border border-rule bg-paper p-3 text-xs leading-relaxed text-graphite"
        >
          {diagram.notes.map((note) => (
            <li key={note} className="break-words">
              <Words text={note} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
