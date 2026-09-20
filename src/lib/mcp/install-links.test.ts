import { describe, expect, it } from "vitest"

import { claudeCodeCommand, cursorInstallLink, vscodeInstallLink } from "./install-links"

const url = "https://subcanvas.app/mcp"

describe("install links", () => {
  it("gives Cursor the server's mcp.json entry, base64-encoded", () => {
    const link = new URL(cursorInstallLink(url))
    expect(link.protocol).toBe("cursor:")
    expect(link.pathname).toBe("/mcp/install")
    expect(link.searchParams.get("name")).toBe("subcanvas")
    expect(JSON.parse(atob(link.searchParams.get("config")!))).toEqual({ url })
  })

  it("gives VS Code the named HTTP server, URL-encoded", () => {
    const link = vscodeInstallLink(url)
    expect(link.startsWith("vscode:mcp/install?")).toBe(true)
    expect(JSON.parse(decodeURIComponent(link.split("?")[1]))).toEqual({ name: "subcanvas", type: "http", url })
  })

  it("gives Claude Code the documented command", () => {
    expect(claudeCodeCommand(url)).toBe("claude mcp add --transport http subcanvas https://subcanvas.app/mcp")
  })
})
