import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  normalizeError,
  normalizeMessage,
  normalizeRoute,
  normalizeStack,
  routePattern,
  STATIC_SEGMENTS,
} from "./normalize"

const v8Stack = (line: number, chunk = "a1b2c3d4e5") => `TypeError: Cannot read properties of undefined (reading 'title')
    at DocumentTitle (https://subcanvas.app/_next/static/chunks/app/page-${chunk}.js:1:${line})
    at renderWithHooks (https://subcanvas.app/_next/static/chunks/framework-${chunk}.js:2:${line + 7})
    at beginWork (https://subcanvas.app/_next/static/chunks/framework-${chunk}.js:3:${line + 9})
    at performUnitOfWork (https://subcanvas.app/_next/static/chunks/framework-${chunk}.js:4:${line})`

describe("normalizeMessage", () => {
  it("takes out ids, numbers, addresses and hashes", () => {
    expect(
      normalizeMessage("Document 0b5a0f09-b2f6-48d5-b6df-005d5d5469c2 of ada@example.test failed after 3 tries (code 5a4f3e2d1c)")
    ).toBe("Document <id> of <email> failed after <n> tries (code <hex>)")
  })

  it("keeps a web address only as far as its host, so no page path or query string gets in", () => {
    expect(normalizeMessage("Failed to load https://subcanvas.app/ada/0b5a/d/6b1c?via=a.b#x")).toBe(
      "Failed to load https://subcanvas.app"
    )
    expect(normalizeMessage("Loading chunk https://subcanvas.app/_next/static/chunks/12.js?dpl=abc failed")).toBe(
      "Loading chunk https://subcanvas.app/_next/static/chunks/<n>.js failed"
    )
  })

  it("keeps a number that is part of a word", () => {
    expect(normalizeMessage("E2E failure in utf8 at position 34")).toBe("E2E failure in utf8 at position <n>")
  })

  it("is one line, and short", () => {
    expect(normalizeMessage("a\n\n  b")).toBe("a b")
    expect(normalizeMessage("x".repeat(5000))).toHaveLength(1000)
  })
})

describe("normalizeStack", () => {
  it("keeps the frames, without the message lines or line numbers that differ", () => {
    const stack = normalizeStack(v8Stack(123))!
    expect(stack.split("\n")[0]).toBe("at DocumentTitle (https://subcanvas.app/_next/static/chunks/app/page-<hex>.js:<n>:<n>)")
    expect(stack).not.toContain("Cannot read")
  })

  it("keeps a server's files from its build or packages on, not where they are on the machine", () => {
    expect(
      normalizeStack(
        "Error: x\n    at create (file:///Users/someone/app/node_modules/.pnpm/lib0@0.2.118/node_modules/lib0/error.js:12:28)\n    at Page (/var/task/.next/server/chunks/ssr/page.js:1:780)"
      )
    ).toBe("at create (node_modules/.pnpm/lib0@<n>.<n>.<n>/node_modules/lib0/error.js:<n>:<n>)\nat Page (.next/server/chunks/ssr/page.js:<n>:<n>)")
  })

  it("reads Firefox's and Safari's frames too", () => {
    expect(normalizeStack("render@https://subcanvas.app/_next/static/chunks/main-1a2b3c4d5e.js:10:20")).toBe(
      "render@https://subcanvas.app/_next/static/chunks/main-<hex>.js:<n>:<n>"
    )
  })

  it("is null when there is nothing to keep", () => {
    expect(normalizeStack(undefined)).toBeNull()
    expect(normalizeStack("Error: only a message")).toBeNull()
  })
})

describe("normalizeError's fingerprint", () => {
  const report = { source: "browser" as const, name: "TypeError", message: "Cannot read properties of undefined (reading 'title')", route: "/[org]" }

  it("is the same for the same error with other ids, line numbers and builds", async () => {
    const one = await normalizeError({ ...report, message: `${report.message} in 0b5a0f09-b2f6-48d5-b6df-005d5d5469c2`, stack: v8Stack(123) })
    const two = await normalizeError({ ...report, message: `${report.message} in 6b1c4b7a-d57a-4a12-9217-40f898f7e4b2`, stack: v8Stack(456, "f0e9d8c7b6") })
    expect(one.fingerprint).toBe(two.fingerprint)
    expect(one.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it("differs by name, message, top frames, and where it happened", async () => {
    const base = await normalizeError({ ...report, stack: v8Stack(1) })
    const others = await Promise.all([
      normalizeError({ ...report, name: "RangeError", stack: v8Stack(1) }),
      normalizeError({ ...report, message: "Something else", stack: v8Stack(1) }),
      normalizeError({ ...report, stack: v8Stack(1).replace("DocumentTitle", "ProjectTree") }),
      normalizeError({ ...report, source: "server", stack: v8Stack(1) }),
    ])
    for (const other of others) expect(other.fingerprint).not.toBe(base.fingerprint)
  })

  it("does not tell routes apart: one error on many pages is one row", async () => {
    const a = await normalizeError({ ...report, stack: v8Stack(1) })
    const b = await normalizeError({ ...report, route: "/[org]/[project]", stack: v8Stack(1) })
    expect(a.fingerprint).toBe(b.fingerprint)
  })
})

describe("normalizeRoute", () => {
  it("turns the server's route path into a pattern", () => {
    expect(normalizeRoute("/[org]/(org)/settings/billing/page")).toBe("/[org]/settings/billing")
    expect(normalizeRoute("/[org]/[project]/d/[docId]/page")).toBe("/[org]/[project]/d/[docId]")
    expect(normalizeRoute("/api/media/[...path]/route")).toBe("/api/media/[...path]")
    expect(normalizeRoute("/page")).toBe("/")
  })

  it("keeps no real address, id or query string", () => {
    expect(normalizeRoute("/ada/0b5a0f09-b2f6-48d5-b6df-005d5d5469c2/d/x?via=1#y")).toBe("/[segment]/[segment]/d/[segment]")
    expect(normalizeRoute("/settings/<script>")).toBe("/settings/[segment]")
  })
})

describe("routePattern", () => {
  it("puts each parameter's name where its value is", () => {
    expect(
      routePattern("/ada/0b5a0f09-b2f6-48d5-b6df-005d5d5469c2/d/6b1c", {
        org: "ada",
        project: "0b5a0f09-b2f6-48d5-b6df-005d5d5469c2",
        docId: "6b1c",
      })
    ).toBe("/[org]/[project]/d/[docId]")
    expect(routePattern("/api/media/a/b", { path: ["a", "b"] })).toBe("/api/media/[...path]")
    expect(routePattern("/", {})).toBe("/")
  })

  it("decodes an address before matching it", () => {
    expect(routePattern("/jos%C3%A9", { org: "josé" })).toBe("/[org]")
  })
})

describe("STATIC_SEGMENTS", () => {
  it("names every folder of the app that is not a parameter or a group", () => {
    const folders = new Set<string>()
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        if (!/^[[(@]/.test(entry.name)) folders.add(entry.name)
        walk(join(dir, entry.name))
      }
    }
    walk(join(__dirname, "../../app"))
    expect([...folders].filter((folder) => !STATIC_SEGMENTS.has(folder))).toEqual([])
  })
})
