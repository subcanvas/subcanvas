import { describe, expect, it } from "vitest"

import { firstParagraph, resolveReadmeUrl, stripFrontMatter } from "./readme"

describe("firstParagraph", () => {
  it("passes over the title, logo, and badges", () => {
    const markdown = `---
title: x
---
<p align="center"><img src="logo.png"></p>

# Turbo

[![build](https://x/b.svg)](https://ci) [![npm](https://x/n.svg)](https://npm)

<!-- a comment -->

Turborepo is a **high-performance** build system for [JavaScript](https://js.dev) and \`TypeScript\`
codebases.

More text.
`
    expect(firstParagraph(markdown)).toBe(
      "Turborepo is a high-performance build system for JavaScript and TypeScript codebases."
    )
  })

  it("passes over setext titles, lists, tables, quotes, and code", () => {
    expect(firstParagraph("Ledger\n======\n\n- a\n- b\n\n> quote\n\n```\ncode here\n```\n\n| a |\n|---|\n\nThe point.")).toBe(
      "The point."
    )
  })

  it("trims to about 160 characters at a word", () => {
    const summary = firstParagraph(`# T\n\n${"word ".repeat(100)}`)
    expect(summary.length).toBeLessThanOrEqual(161)
    expect(summary.endsWith("word…")).toBe(true)
  })

  it("is empty when there is no prose", () => {
    expect(firstParagraph("# Only a title\n\n![logo](x.png)\n")).toBe("")
    expect(firstParagraph("")).toBe("")
  })
})

describe("stripFrontMatter", () => {
  it("removes it only at the very start", () => {
    expect(stripFrontMatter("---\na: 1\n---\n# T")).toBe("# T")
    expect(stripFrontMatter("# T\n\n---\na\n---\n")).toBe("# T\n\n---\na\n---\n")
  })
})

describe("resolveReadmeUrl", () => {
  const repository = { repository: "acme/shop", ref: "main", commit: "abc123", description: "" }
  const resolve = (url: string, kind: "link" | "image" = "link", readme = "services/payments/README.md") =>
    resolveReadmeUrl(url, kind, repository, readme)

  it("leaves absolute addresses and page anchors alone", () => {
    for (const url of ["https://example.com/a", "http://x.dev", "mailto:a@b.c", "//cdn.example/x.png", "#usage", ""])
      expect(resolve(url)).toBe(url)
  })

  it("points images at the raw file, at the imported commit", () => {
    expect(resolve("./charge-states.png", "image")).toBe(
      "https://raw.githubusercontent.com/acme/shop/abc123/services/payments/charge-states.png"
    )
    expect(resolve("../../docs/flow.svg?raw=true", "image")).toBe(
      "https://raw.githubusercontent.com/acme/shop/abc123/docs/flow.svg?raw=true"
    )
    expect(resolve("/assets/logo.png", "image", "README.md")).toBe(
      "https://raw.githubusercontent.com/acme/shop/abc123/assets/logo.png"
    )
  })

  it("points links at the file or folder page", () => {
    expect(resolve("../ledger/README.md#api")).toBe("https://github.com/acme/shop/blob/abc123/services/ledger/README.md#api")
    expect(resolve("internal/gateway")).toBe("https://github.com/acme/shop/tree/abc123/services/payments/internal/gateway")
    expect(resolve("docs", "link", "README.md")).toBe("https://github.com/acme/shop/tree/abc123/docs")
  })

  it("cannot climb out of the repository", () => {
    expect(resolve("../../../../etc/passwd")).toBe("https://github.com/acme/shop/tree/abc123/etc/passwd")
    expect(resolve("../../..", "link")).toBe("https://github.com/acme/shop/tree/abc123")
  })
})
