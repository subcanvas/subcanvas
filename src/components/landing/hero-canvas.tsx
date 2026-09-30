"use client"

import { FileText } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"
import { COLORS } from "@/lib/whiteboard/colors"

// A working miniature of the product, drawn as an imported repository
// would be: click a stacked box to go inside it.
// Positions are percentages of the sheet, so it scales with the page.

type Box = {
  id: string
  label: string
  x: number
  y: number
  w?: number
  tone?: "green" | "blue" | "orange" | "purple"
  inside?: string // another sheet
  note?: string // a page of notes
}
type Sheet = { id: string; title: string; boxes: Box[]; lines: [string, string, string?][] }

const SHEETS: Record<string, Sheet> = {
  root: {
    id: "root",
    title: "acme/shop",
    boxes: [
      { id: "web", label: "Web app", x: 12, y: 20, tone: "green", inside: "web" },
      { id: "api", label: "API", x: 12, y: 62, tone: "blue", inside: "api" },
      { id: "payments", label: "Payments", x: 44, y: 41, note: "Charges cards through Stripe and owns the charges table. Every settled charge becomes a journal entry in the ledger." },
      { id: "ledger", label: "Ledger", x: 74, y: 41, tone: "orange", inside: "ledger" },
    ],
    lines: [
      ["web", "payments"],
      ["api", "payments", "gRPC"],
      ["payments", "ledger"],
    ],
  },
  web: {
    id: "web",
    title: "Web app",
    boxes: [
      { id: "store", label: "Storefront", x: 8, y: 40, w: 24 },
      { id: "checkout", label: "Checkout", x: 42, y: 40, tone: "green", inside: "checkout" },
      { id: "auth", label: "Sign-in", x: 72, y: 40, note: "Sessions last 30 days. The API checks the same cookie, so one sign-in covers both." },
    ],
    lines: [
      ["store", "checkout"],
      ["checkout", "auth", "needs"],
    ],
  },
  checkout: {
    id: "checkout",
    title: "Checkout",
    boxes: [
      { id: "cart", label: "Cart", x: 14, y: 24 },
      { id: "address", label: "Shipping address", x: 14, y: 60, note: "Checked by the API before an order exists, so a bad address never reaches Payments." },
      { id: "pay", label: "Pay button", x: 58, y: 42, tone: "blue" },
    ],
    lines: [["address", "pay", "before"]],
  },
  api: {
    id: "api",
    title: "API",
    boxes: [
      { id: "routes", label: "Routes", x: 10, y: 40, tone: "purple", note: "REST under /v1. Each route checks the session first, then the person's role." },
      { id: "orders", label: "Orders", x: 42, y: 40 },
      { id: "db", label: "Database", x: 72, y: 40, tone: "blue" },
    ],
    lines: [
      ["routes", "orders"],
      ["orders", "db"],
    ],
  },
  ledger: {
    id: "ledger",
    title: "Ledger",
    boxes: [
      { id: "journal", label: "Journal", x: 12, y: 26 },
      { id: "reconcile", label: "Reconcile", x: 12, y: 60, tone: "orange", note: "Runs every night. Matches Stripe payouts to journal entries and flags anything a cent off." },
      { id: "reports", label: "Reports", x: 56, y: 42 },
    ],
    lines: [
      ["reconcile", "journal", "reads"],
      ["reconcile", "reports"],
    ],
  },
}

const TONES = {
  green: COLORS.green.stroke,
  blue: COLORS.blue.stroke,
  orange: COLORS.orange.stroke,
  purple: COLORS.purple.stroke,
}
const BOX_W = 20
const BOX_H = 17

export function HeroCanvas() {
  const [trail, setTrail] = useState<string[]>(["root"])
  const [note, setNote] = useState<Box | null>(null)
  const sheet = SHEETS[trail[trail.length - 1]]
  const center = (box: Box) => ({ x: box.x + (box.w ?? BOX_W) / 2, y: box.y + BOX_H / 2 })

  function open(box: Box) {
    if (box.inside) {
      setNote(null)
      setTrail((current) => [...current, box.inside!])
    } else if (box.note) setNote(note?.id === box.id ? null : box)
  }

  return (
    <div className="sheet-stack overflow-hidden rounded-xl border border-rule bg-sheet [--stack-edge:var(--blueline)] [--stack-offset:6px]">
      <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
        <ol aria-label="Where you are" className="flex min-w-0 items-center">
          {trail.map((id, index) => (
            <li key={`${id}-${index}`} className={cn(index > 0 && "-ml-1.5")} style={{ zIndex: index }}>
              <button
                type="button"
                onClick={() => {
                  setNote(null)
                  setTrail(trail.slice(0, index + 1))
                }}
                aria-current={index === trail.length - 1 ? "page" : undefined}
                className={cn(
                  "block max-w-36 truncate rounded-md border bg-sheet px-2 py-1 text-xs shadow-[2px_0_0_0_var(--sheet)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  index === trail.length - 1
                    ? "border-ink/60 font-medium text-ink"
                    : "border-rule text-graphite hover:border-cobalt hover:text-ink"
                )}
              >
                {SHEETS[id].title}
              </button>
            </li>
          ))}
        </ol>
        <span className="ml-auto font-mono text-[10px] tracking-wide text-graphite uppercase">
          {trail.length === 1 ? "Top level" : `${trail.length - 1} ${trail.length === 2 ? "level" : "levels"} in`}
        </span>
      </div>

      <div
        key={sheet.id}
        className="animate-sheet-enter relative aspect-[4/3] w-full bg-paper sm:aspect-[16/9]"
        style={{
          backgroundImage: "radial-gradient(var(--blueline) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {sheet.lines.map(([from, to]) => {
            const a = center(sheet.boxes.find((b) => b.id === from)!)
            const b = center(sheet.boxes.find((b) => b.id === to)!)
            const mid = (a.x + b.x) / 2
            return (
              <path
                key={`${from}-${to}`}
                d={`M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`}
                fill="none"
                stroke="var(--graphite)"
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>

        {sheet.lines.map(([from, to, label]) => {
          if (!label) return null
          const a = center(sheet.boxes.find((b) => b.id === from)!)
          const b = center(sheet.boxes.find((b) => b.id === to)!)
          return (
            <span
              key={`${from}-${to}-label`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[5px] border border-rule bg-sheet px-1.5 py-px font-mono text-[10px] text-graphite"
              style={{ left: `${(a.x + b.x) / 2}%`, top: `${(a.y + b.y) / 2}%` }}
            >
              {label}
            </span>
          )
        })}

        {sheet.boxes.map((box) => {
          const tone = box.tone ? TONES[box.tone] : null
          const opens = Boolean(box.inside || box.note)
          return (
            <button
              key={box.id}
              type="button"
              disabled={!opens}
              onClick={() => open(box)}
              aria-label={
                box.inside ? `${box.label}: open the whiteboard inside` : box.note ? `${box.label}: read the page inside` : box.label
              }
              className={cn(
                "absolute flex items-center justify-center rounded-lg border px-2 text-center text-[11px] leading-tight font-medium outline-none transition-[translate,box-shadow] sm:text-[13px]",
                box.inside && "sheet-stack [--stack-offset:3px]",
                opens ? "cursor-pointer hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring" : "cursor-default",
                note?.id === box.id && "outline-2 outline-offset-2 outline-cobalt"
              )}
              style={{
                left: `${box.x}%`,
                top: `${box.y}%`,
                width: `${box.w ?? BOX_W}%`,
                height: `${BOX_H}%`,
                borderColor: tone ?? "color-mix(in oklch, var(--ink) 55%, var(--sheet))",
                backgroundColor: tone ? `color-mix(in oklch, ${tone} 9%, var(--sheet))` : "var(--sheet)",
                ["--stack-edge" as string]: tone ?? "var(--blueline)",
              }}
            >
              {box.label}
              {box.note && (
                <span className="absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-[4px] border border-rule bg-sheet text-graphite">
                  <FileText className="size-2.5" aria-hidden />
                </span>
              )}
            </button>
          )
        })}

        {note && (
          <div
            role="note"
            className="animate-sheet-enter absolute right-3 bottom-3 left-3 rounded-lg border border-rule bg-sheet p-3 shadow-md sm:left-auto sm:w-72"
          >
            <p className="mb-1 font-mono text-[10px] tracking-wide text-graphite uppercase">Inside {note.label}</p>
            <p className="text-sm leading-relaxed">{note.note}</p>
          </div>
        )}
      </div>

      <p className="border-t border-rule px-3 py-2 text-xs text-graphite">
        Try it: click a stacked box to go inside. A page icon means the box holds a page.
      </p>
    </div>
  )
}
