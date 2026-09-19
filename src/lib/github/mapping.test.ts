import { describe, expect, it } from "vitest"

import { findSubcanvasFiles, mapFolders, MAX_MAPPED_FOLDERS } from "./mapping"

const files = (...paths: string[]) => paths.map((path) => ({ path, size: 10 }))
const paths = (mapping: ReturnType<typeof mapFolders>) => mapping.folders.map((folder) => folder.path)

describe("mapFolders", () => {
  it("maps folders that describe themselves, two levels deep", () => {
    const mapping = mapFolders(
      files(
        "README.md",
        "api/README.md",
        "api/handlers/readme.markdown",
        "api/handlers/users/README.md",
        "web/Readme",
        "scripts/run.sh"
      )
    )
    expect(paths(mapping)).toEqual(["api", "api/handlers", "web"])
    expect(mapping.rootReadme?.path).toBe("README.md")
    expect(mapping.folders[1]).toMatchObject({ parent: "api", readme: { path: "api/handlers/readme.markdown" } })
    expect(mapping.capped).toBe(false)
  })

  it("prefers README.md over other spellings", () => {
    const mapping = mapFolders(files("a/README", "a/README.md", "a/readme.markdown"))
    expect(mapping.folders[0].readme?.path).toBe("a/README.md")
  })

  it("maps the children of conventional roots, and the root that holds them", () => {
    const mapping = mapFolders(
      files("packages/ui/index.ts", "packages/core/index.ts", "apps/web/page.tsx", "cmd/server/main.go", "lib/x/y.ts")
    )
    expect(paths(mapping)).toEqual(["apps", "apps/web", "cmd", "cmd/server", "packages", "packages/core", "packages/ui"])
    expect(mapping.folders.find((folder) => folder.path === "packages/ui")?.parent).toBe("packages")
  })

  it("skips dot-folders, dependencies, and build output", () => {
    const mapping = mapFolders(
      files(
        ".github/README.md",
        "node_modules/x/README.md",
        "packages/ui/node_modules/y/README.md",
        "packages/ui/dist/README.md",
        "packages/.cache/a.ts",
        "vendor/lib/README.md",
        "target/README.md",
        "packages/ui/a.ts"
      )
    )
    expect(paths(mapping)).toEqual(["packages", "packages/ui"])
  })

  it("leaves out docs, examples, and tests unless a .subcanvas file asks for them", () => {
    const base = ["svc/README.md", "docs/README.md", "examples/basic/README.md", "packages/tests/a.ts"]
    expect(paths(mapFolders(files(...base)))).toEqual(["svc"])
    expect(paths(mapFolders(files(...base, "examples/basic/.subcanvas")))).toEqual([
      "examples",
      "examples/basic",
      "svc",
    ])
  })

  it("maps a folder with a .subcanvas file at any depth, with the folders above it", () => {
    const mapping = mapFolders(files("svc/README.md", "svc/internal/deep/gateway/.subcanvas"))
    expect(paths(mapping)).toEqual(["svc", "svc/internal", "svc/internal/deep", "svc/internal/deep/gateway"])
    expect(mapping.folders[3]).toMatchObject({ hasSubcanvasFile: true, parent: "svc/internal/deep" })
  })

  it("honors ignore lists, even over a .subcanvas file", () => {
    const mapping = mapFolders(
      files("svc/README.md", "svc/fixtures/README.md", "svc/fixtures/deep/.subcanvas", "svc/fixturesque/README.md"),
      ["svc/fixtures"]
    )
    expect(paths(mapping)).toEqual(["svc", "svc/fixturesque"])
  })

  it("uses src only when nothing else qualifies", () => {
    expect(paths(mapFolders(files("src/auth/a.ts", "src/billing/b.ts", "src/index.ts")))).toEqual([
      "src",
      "src/auth",
      "src/billing",
    ])
    expect(paths(mapFolders(files("src/auth/a.ts", "api/README.md")))).toEqual(["api"])
  })

  it("maps everything in src once one folder there has a README", () => {
    const mapping = mapFolders(files("src/cart/README.md", "src/payments/main.go", "src/tests/a.go", "deploy/README.md"))
    expect(paths(mapping)).toEqual(["deploy", "src", "src/cart", "src/payments"])
  })

  it("falls back to the top-level folders that hold code", () => {
    const mapping = mapFolders(files("server/main.go", "client/deep/app.tsx", "assets/logo.png", "tests/a.py", "LICENSE"))
    expect(paths(mapping)).toEqual(["client", "server"])
  })

  it("maps nothing when there is nothing", () => {
    expect(paths(mapFolders(files("README.md", "LICENSE", "assets/logo.png")))).toEqual([])
  })

  it("stops at the cap, keeping .subcanvas folders and the ones nearest the top", () => {
    const many = Array.from({ length: 100 }, (_, i) => `packages/p${String(i).padStart(3, "0")}/index.ts`)
    const mapping = mapFolders(files(...many, "zeta/README.md", "packages/p099/.subcanvas"))
    expect(mapping.capped).toBe(true)
    expect(mapping.folders).toHaveLength(MAX_MAPPED_FOLDERS)
    expect(paths(mapping)).toContain("packages/p099")
    expect(paths(mapping)).toContain("zeta")
    expect(paths(mapping)).not.toContain("packages/p098")
    // Every mapped folder's parent is mapped too.
    const mapped = new Set(paths(mapping))
    for (const folder of mapping.folders) expect(folder.parent === "" || mapped.has(folder.parent)).toBe(true)
  })

  it("shares the cap between parents instead of spending it on the first", () => {
    const crates = Array.from({ length: 80 }, (_, i) => `apps/a${String(i).padStart(2, "0")}/README.md`)
    const mapping = mapFolders(files(...crates, "packages/ui/index.ts", "packages/core/index.ts", "services/api/main.go"))
    expect(mapping.capped).toBe(true)
    expect(paths(mapping)).toEqual(expect.arrayContaining(["packages/ui", "packages/core", "services/api", "apps/a00"]))
  })

  it("handles a large tree quickly", () => {
    const many = Array.from({ length: 100_000 }, (_, i) => `packages/p${i % 500}/src/d${i % 37}/f${i}.ts`)
    const started = performance.now()
    mapFolders(files(...many))
    expect(performance.now() - started).toBeLessThan(2000)
  })
})

describe("findSubcanvasFiles", () => {
  it("finds them by folder, outside skipped folders", () => {
    const found = findSubcanvasFiles(
      files(".subcanvas", "a/.subcanvas", "a/b/c/.subcanvas", "node_modules/x/.subcanvas", ".git/.subcanvas", "a/not.subcanvas")
    )
    expect([...found.keys()]).toEqual(["", "a", "a/b/c"])
  })
})
