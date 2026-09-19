import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import { findSubcanvasFiles, mapFolders } from "./mapping"
import { HEADING_KEY, humanize, planImport, TOP_BOARD_TITLE } from "./plan"
import type { Repository, RepositoryProvider } from "./provider"
import { parseSubcanvasFile, type SubcanvasFile } from "./subcanvas-file"

// The GitHub interface, answered from a folder of this repository. No network.
function fixtureProvider(name: string): RepositoryProvider {
  const root = join(__dirname, "__fixtures__", name)
  const walk = (folder: string): string[] =>
    readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(folder, entry.name)) : [join(folder, entry.name)]
    )
  return {
    describe: async () => ({ repository: `acme/${name}`, ref: "main", commit: "abc123", description: "From GitHub." }),
    listFiles: async () => ({
      files: walk(root).map((path) => ({ path: relative(root, path), size: statSync(path).size })),
    }),
    readFile: async (_, path) => readFileSync(join(root, path), "utf8"),
  }
}

// The same steps the importer takes, without the database.
async function plan(provider: RepositoryProvider) {
  const repository: Repository = await provider.describe({ owner: "acme", name: "shop" })
  const { files } = await provider.listFiles(repository)
  const subcanvasFiles = new Map<string, SubcanvasFile>()
  const warnings: string[] = []
  for (const [folder, file] of findSubcanvasFiles(files)) {
    const parsed = parseSubcanvasFile((await provider.readFile(repository, file.path)) ?? "", folder)
    subcanvasFiles.set(folder, parsed.file)
    warnings.push(...parsed.warnings)
  }
  const mapping = mapFolders(files, [...subcanvasFiles.values()].flatMap((file) => file.ignore))
  const readmes = new Map<string, string>()
  for (const folder of mapping.folders)
    if (folder.readme) readmes.set(folder.path, (await provider.readFile(repository, folder.readme.path))!)
  const planned = planImport({ repository, mapping, subcanvasFiles, readmes })
  return { ...planned, warnings: [...warnings, ...planned.warnings], mapping }
}

describe("planImport, on the shop fixture", async () => {
  const { boards, warnings, mapping } = await plan(fixtureProvider("shop"))
  const board = (folder: string) => boards.find((candidate) => candidate.folder === folder)!
  const node = (folder: string, key: string) => board(folder).nodes.find((candidate) => candidate.key === key)!

  it("maps the folders the rules and the files ask for", () => {
    expect(mapping.folders.map((folder) => folder.path)).toEqual([
      "apps",
      "apps/admin",
      "apps/web",
      "packages",
      "packages/ui",
      "platform",
      "platform/cloud",
      "platform/cloud/modules",
      "platform/cloud/modules/queue",
      "services",
      "services/ledger",
      "services/notifications",
      "services/payments",
      "services/payments/internal",
      "services/payments/internal/gateway",
    ])
  })

  it("draws the top whiteboard from the root file", () => {
    const top = board("")
    expect(top.title).toBe("Shop")
    expect(top.nodes.map((planned) => planned.key)).toEqual([HEADING_KEY, "#readme", "apps", "packages", "platform", "services"])
    expect(node("", HEADING_KEY)).toMatchObject({ kind: "text", title: "Shop", path: null })
    expect(node("", HEADING_KEY).description).toContain("five services")
    expect(node("", "services")).toMatchObject({
      title: "Services",
      path: "services",
      holds: { kind: "board", folder: "services" },
    })
  })

  it("creates parents before the whiteboards inside them", () => {
    const order = boards.map((planned) => planned.folder)
    for (const folder of order.filter(Boolean))
      expect(order.indexOf(folder)).toBeGreaterThan(order.indexOf(folder.split("/").slice(0, -1).join("/")))
  })

  it("titles and describes nodes from the file, then the README, then the folder name", () => {
    expect(node("apps", "apps/web")).toMatchObject({
      title: "Storefront",
      description: "The storefront customers see.",
      holds: { kind: "readme", file: { path: "apps/web/README.md" } },
    })
    expect(node("services", "services/ledger")).toMatchObject({
      title: "Ledger",
      description: "Double-entry bookkeeping. Every movement of money is two rows that sum to zero.",
    })
    expect(node("services", "services/notifications")).toMatchObject({ title: "Notifications", description: "", holds: null })
    // A title that is not text is ignored, not fatal.
    expect(node("apps", "apps/admin").title).toBe("Admin")
  })

  it("gives a folder with folders inside a whiteboard, and its README a node there", () => {
    expect(node("services", "services/payments")).toMatchObject({
      title: "Payments",
      description: "Charges cards and reconciles payouts.",
      holds: { kind: "board", folder: "services/payments" },
    })
    expect(board("services/payments").nodes.map((planned) => planned.title)).toEqual(["README", "Internal"])
    expect(node("services/payments", "services/payments#readme").holds).toEqual({
      kind: "readme",
      file: expect.objectContaining({ path: "services/payments/README.md" }),
    })
  })

  it("places each connection on the whiteboard where it can be drawn", () => {
    expect(board("services").edges).toEqual([
      expect.objectContaining({ source: "services/payments", target: "services/ledger", label: "gRPC" }),
      expect.objectContaining({ source: "services/payments", target: "services/notifications", label: "events" }),
    ])
    expect(board("services").edges[0].description).toContain("idempotent")
    expect(board("").edges).toEqual([
      expect.objectContaining({ source: "apps", target: "services", label: "REST" }),
      expect.objectContaining({ source: "apps", target: "packages", label: "" }),
    ])
  })

  it("reports what it could not use", () => {
    expect(warnings).toEqual(
      expect.arrayContaining([
        "services/payments/.subcanvas: `to: services/nowhere` is not a folder on the diagram.",
        "apps/web/.subcanvas: `unknown_key` is not a known key.",
        "apps/admin/.subcanvas: `title` must be text.",
        "apps/admin/.subcanvas: `connects` must be a list.",
      ])
    )
  })
})

describe("planImport", () => {
  it("falls back to the repository's own name and description", () => {
    const { boards } = planImport({
      repository: { repository: "acme/tool", ref: "main", commit: "abc", description: "A tool." },
      mapping: mapFolders([{ path: "cli/README.md", size: 1 }]),
      subcanvasFiles: new Map(),
      readmes: new Map(),
    })
    expect(boards).toHaveLength(1)
    expect(boards[0].title).toBe(TOP_BOARD_TITLE)
    expect(boards[0].nodes[0]).toMatchObject({ title: "acme/tool", description: "A tool." })
    expect(boards[0].nodes[1]).toMatchObject({ title: "CLI", path: "cli" })
  })

  it("says so when the cap was hit", () => {
    const files = Array.from({ length: 80 }, (_, i) => ({ path: `packages/p${i}/index.ts`, size: 1 }))
    const { warnings } = planImport({
      repository: { repository: "a/b", ref: "main", commit: "abc", description: "" },
      mapping: mapFolders(files),
      subcanvasFiles: new Map(),
      readmes: new Map(),
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("stops at 60")
  })
})

describe("humanize", () => {
  it.each([
    ["payments-api", "Payments API"],
    ["eslint_config", "Eslint Config"],
    ["ui", "UI"],
    ["src", "Source"],
    ["next.js", "Next JS"],
    ["myService", "MyService"],
    ["---", "---"],
  ])("%s becomes %s", (input, output) => expect(humanize(input)).toBe(output))
})
