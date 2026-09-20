"use client"

import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { THEME_OPTIONS, type ThemeValue } from "@/components/theme-options"
import { cn } from "@/lib/utils"

// A small picture of the app in each theme. The colors are written out
// rather than read from the tokens: a preview of dark has to be dark while
// the page around it is light.
const PREVIEWS = {
  light: { paper: "#f4f6fa", sheet: "#ffffff", rule: "#dde3ee", ink: "#10162f", cobalt: "#2447f9" },
  dark: { paper: "#171717", sheet: "#1f1f1f", rule: "#333333", ink: "#ededed", cobalt: "#5379ff" },
}

function Preview({ colors, className }: { colors: (typeof PREVIEWS)["light"]; className?: string }) {
  return (
    <span className={cn("flex gap-1.5 p-2", className)} style={{ backgroundColor: colors.paper }}>
      <span className="w-1/4 rounded-sm" style={{ backgroundColor: colors.rule }} />
      <span
        className="flex flex-1 flex-col gap-1 rounded-sm border p-1.5"
        style={{ backgroundColor: colors.sheet, borderColor: colors.rule }}
      >
        <span className="h-1 w-2/3 rounded-full" style={{ backgroundColor: colors.ink }} />
        <span className="h-1 w-1/2 rounded-full" style={{ backgroundColor: colors.rule }} />
        <span className="mt-auto h-1.5 w-1/3 rounded-full" style={{ backgroundColor: colors.cobalt }} />
      </span>
    </span>
  )
}

const subscribe = () => () => {}

export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  // The chosen theme is only known in the browser. Until then nothing is
  // marked as chosen, rather than marking the wrong one.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  const chosen = mounted ? (theme as ThemeValue | undefined) : undefined

  function move(event: React.KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = THEME_OPTIONS[(index + step + THEME_OPTIONS.length) % THEME_OPTIONS.length]
    setTheme(next.value)
    document.getElementById(`theme-${next.value}`)?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }, index) => (
        <button
          key={value}
          id={`theme-${value}`}
          type="button"
          role="radio"
          aria-checked={chosen === value}
          // One stop in the tab order, arrows between the choices.
          tabIndex={chosen === value || (!chosen && index === 0) ? 0 : -1}
          onClick={() => setTheme(value)}
          onKeyDown={(event) => move(event, index)}
          className={cn(
            "flex flex-col overflow-hidden rounded-lg border text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            chosen === value ? "border-cobalt" : "border-rule hover:border-input"
          )}
        >
          <span className="flex h-20 w-full border-b border-rule" aria-hidden>
            {value === "system" ? (
              <>
                <Preview colors={PREVIEWS.light} className="w-1/2" />
                <Preview colors={PREVIEWS.dark} className="w-1/2" />
              </>
            ) : (
              <Preview colors={PREVIEWS[value]} className="w-full" />
            )}
          </span>
          <span className={cn("flex items-center gap-2 px-3 py-2 text-sm font-medium", chosen === value && "bg-accent")}>
            <Icon className="size-4 text-graphite" aria-hidden />
            {label}
          </span>
        </button>
      ))}
    </div>
  )
}
