import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { MAX_BODY_TEXT, MAX_LABEL, MAX_TITLE } from "@/lib/whiteboard/limits"

import { EXAMPLE_PROMPTS } from "./example-prompts"
import { PLUGIN_ID, PLUGIN_SERVER_URL } from "./install-links"
import { tools } from "./tools"

// The Claude Code plugin (plugins/subcanvas) is prose and JSON, so nothing
// else would notice when it drifts from the server it describes. These keep
// it to the tools that exist, the limits the app keeps, and the names the
// Connect an agent page tells people to install.

const root = join(__dirname, "../../..")
const read = (path: string) => readFileSync(join(root, path), "utf8")
const json = (path: string) => JSON.parse(read(path))

const marketplace = json(".claude-plugin/marketplace.json")
const entry = marketplace.plugins.find((plugin: { name: string }) => plugin.name === "subcanvas")
const pluginRoot = entry.source.replace(/^\.\//, "")
const manifest = json(`${pluginRoot}/.claude-plugin/plugin.json`)
const skills = readdirSync(join(root, pluginRoot, "skills")).map((name) => ({
  name,
  text: read(`${pluginRoot}/skills/${name}/SKILL.md`),
}))

describe("the Claude Code plugin", () => {
  it("is installed by the id the app gives", () => {
    expect(`${entry.name}@${marketplace.name}`).toBe(PLUGIN_ID)
    expect(manifest.name).toBe(entry.name)
    expect(existsSync(join(root, pluginRoot))).toBe(true)
  })

  it("has a version, and the repository's license", () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
    // Set in one place only, as the plugin docs ask: plugin.json wins anyway.
    expect(entry.version).toBeUndefined()
    expect(manifest.license).toBe(json("package.json").license)
  })

  it("connects to subcanvas.app's server", () => {
    expect(json(`${pluginRoot}/.mcp.json`)).toEqual({
      mcpServers: { subcanvas: { type: "http", url: PLUGIN_SERVER_URL } },
    })
  })

  it("names only tools that exist", () => {
    const names = new Set(tools.map((tool) => tool.name))
    // A tool's name is a verb and what it acts on; field names are not.
    const verbs = /^(list|get|create|read|add|update|delete|connect|arrange|attach|detach|set|trash|restore|import|insert|replace|append|rename|move)_\w+$/
    for (const { name, text } of skills) {
      const named = [...text.matchAll(/`(\w+)`/g)].map((match) => match[1]).filter((word) => verbs.test(word))
      expect(named.filter((word) => !names.has(word)), name).toEqual([])
    }
  })

  it("gives the limits the app keeps", () => {
    const diagrams = skills.find((skill) => skill.name === "diagrams")!.text
    const number = (value: number) => value.toLocaleString("en-US")
    expect(diagrams).toContain(`${number(MAX_TITLE)} characters for a title`)
    expect(diagrams).toContain(`${number(MAX_BODY_TEXT)} for a text node's body text`)
    expect(diagrams).toContain(`${number(MAX_LABEL)} for an arrow's label`)
  })

  it("is written without em dashes or exclamation marks", () => {
    for (const { name, text } of [...skills, { name: "README", text: read(`${pluginRoot}/README.md`) }]) {
      expect(text, name).not.toContain("—")
      expect(text.replace(/<!--.*?-->/g, ""), name).not.toMatch(/!\s/)
    }
  })
})

describe("example prompts", () => {
  it("are written out word for word wherever they are listed", () => {
    for (const path of ["README.md", "docs/MCP.md", `${pluginRoot}/README.md`]) {
      const text = read(path)
      for (const { prompt } of EXAMPLE_PROMPTS) expect(text, path).toContain(prompt)
    }
  })
})
