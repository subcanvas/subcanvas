import { readFileSync } from "node:fs"
import { join } from "node:path"

import { expect, it } from "vitest"

import { tools } from "./tools"

// docs/MCP.md lists the tools by hand, for people. This keeps the list
// honest: every tool is named there, and nothing is named that is not one.
it("documents exactly the tools that exist", () => {
  const doc = readFileSync(join(__dirname, "../../../docs/MCP.md"), "utf8")
  const table = doc.slice(doc.indexOf("## Tools"), doc.indexOf("## Security model"))
  const documented = [...table.matchAll(/^\| `(\w+)` \|/gm)].map((match) => match[1])
  expect(documented.sort()).toEqual(tools.map((tool) => tool.name).sort())
})
