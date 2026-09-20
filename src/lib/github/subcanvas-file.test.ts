import { describe, expect, it } from "vitest"

import { parseSubcanvasFile } from "./subcanvas-file"

describe("parseSubcanvasFile", () => {
  it("reads the documented format", () => {
    const { file, warnings } = parseSubcanvasFile(
      `title: Payments
description: Charges cards and reconciles payouts.
connects:
  - to: services/ledger          # path from the repository root
    label: gRPC
    description: Posts a journal entry for every settled charge.
  - to: ./services/notifications/
ignore:
  - fixtures
`,
      "services/payments"
    )
    expect(warnings).toEqual([])
    expect(file).toEqual({
      title: "Payments",
      description: "Charges cards and reconciles payouts.",
      connects: [
        { to: "services/ledger", label: "gRPC", description: "Posts a journal entry for every settled charge." },
        { to: "services/notifications", label: "", description: "" },
      ],
      // Relative to the folder the file is in.
      ignore: ["services/payments/fixtures"],
    })
  })

  it("treats an empty file as a marker", () => {
    expect(parseSubcanvasFile("", "a")).toEqual({
      file: { title: null, description: null, connects: [], ignore: [] },
      warnings: [],
    })
    expect(parseSubcanvasFile("# only a comment\n", "a").warnings).toEqual([])
  })

  it.each([
    ["broken YAML", "title: [unclosed"],
    ["a list at the top", "- a\n- b"],
    ["a bare string", "just text"],
    ["a number", "42"],
  ])("ignores %s and says so", (_, text) => {
    const { file, warnings } = parseSubcanvasFile(text, "svc")
    expect(file.title).toBeNull()
    expect(file.connects).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/^svc\/\.subcanvas: /)
  })

  it("accepts only strings", () => {
    const { file, warnings } = parseSubcanvasFile(
      `title: 42
description: [a, b]
connects:
  - to: 7
  - label: no target
  - just a string
  - to: ok
    label: { nested: true }
ignore:
  - 3
  - { a: 1 }
  - kept
extra: true
`,
      ""
    )
    expect(file).toEqual({
      title: null,
      description: null,
      connects: [{ to: "ok", label: "", description: "" }],
      ignore: ["kept"],
    })
    expect(warnings.length).toBeGreaterThanOrEqual(7)
    expect(warnings.every((warning) => warning.startsWith(".subcanvas: "))).toBe(true)
  })

  it("refuses paths that leave the repository", () => {
    const { file, warnings } = parseSubcanvasFile(
      `connects:
  - to: ../../etc/passwd
  - to: a/../../b
  - to: 'C:\\windows'
  - to: /
ignore:
  - ..
  - ../sibling
`,
      "svc"
    )
    expect(file.connects).toEqual([])
    expect(file.ignore).toEqual([])
    expect(warnings).toHaveLength(6)
  })

  it("caps lengths and counts", () => {
    const { file, warnings } = parseSubcanvasFile(
      `title: ${"t".repeat(500)}
description: ${"d".repeat(5000)}
connects:
${Array.from({ length: 80 }, (_, i) => `  - to: s/${i}`).join("\n")}
`,
      ""
    )
    expect(file.title).toHaveLength(120)
    expect(file.description).toHaveLength(500)
    expect(file.connects).toHaveLength(50)
    expect(warnings).toHaveLength(3)
  })

  it("refuses YAML aliases, which is how a small file becomes a huge one", () => {
    const bomb = `a: &a ["x","x","x","x","x","x","x","x","x"]
b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]
c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]
title: *c
`
    const { file, warnings } = parseSubcanvasFile(bomb, "")
    expect(file.title).toBeNull()
    expect(warnings).toHaveLength(1)
  })

  it("ignores a file that is too large", () => {
    const { file, warnings } = parseSubcanvasFile(`title: ok\n# ${"x".repeat(30_000)}`, "")
    expect(file.title).toBeNull()
    expect(warnings).toHaveLength(1)
  })

  it("does not run tags or build objects with a prototype", () => {
    const { file } = parseSubcanvasFile(
      `title: !!js/function "function(){ return 1 }"
__proto__:
  title: polluted
`,
      ""
    )
    expect(file.title === null || typeof file.title === "string").toBe(true)
    expect(({} as { title?: string }).title).toBeUndefined()
  })
})
