import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

// A component that calls a hook must say "use client", or a server page that
// renders it calls the hook on the server. Without the line it can still
// work, until something else (the MCP endpoint rendering text with BlockNote)
// loads the hook's module as a client module; from then on every server page
// that draws the component fails until the server restarts. Badge did this
// (e2e/pages-after-agent.spec.ts). Hooks of its own a module only exports
// (src/hooks) are fine: the component that calls them is what needs the line.

const ROOTS = ["src/app", "src/components"].map((root) => join(__dirname, "../..", root))
const HOOK_CALL = /\buse(?:State|Effect|LayoutEffect|Ref|Memo|Callback|Context|Reducer|Transition|Id|SyncExternalStore|Optimistic|ActionState|Render)\s*\(/

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx$/.test(entry.name) ? [path] : []
  })
}

describe("client components", () => {
  it("say \"use client\" when they call a hook", () => {
    const missing = ROOTS.flatMap(sources).filter((path) => {
      const text = readFileSync(path, "utf8")
      return HOOK_CALL.test(text) && !/^\s*["']use client["']/.test(text)
    })
    expect(missing.map((path) => relative(join(__dirname, "../.."), path))).toEqual([])
  })
})
