import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { ICON_NODES } from "./icon-data"
import { ICON_CHOICES, iconLabel, iconNode } from "./icons"
import { iconName } from "./schema"

const DRAWABLE = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"])

describe("the icon set", () => {
  it("has drawing data for every icon it offers, and offers each once", () => {
    for (const { name, label } of ICON_CHOICES) {
      expect(iconNode(name), name).not.toBeNull()
      expect(iconName(name), name).toBe(name)
      expect(label, name).not.toBe("")
    }
    expect(new Set(ICON_CHOICES.map((choice) => choice.name)).size).toBe(ICON_CHOICES.length)
    expect(Object.keys(ICON_NODES).sort()).toEqual(ICON_CHOICES.map((choice) => choice.name).sort())
  })

  it("is made of plain shapes only", () => {
    for (const [name, node] of Object.entries(ICON_NODES))
      for (const [tag, attributes] of node) {
        expect(DRAWABLE.has(tag), `${name}: ${tag}`).toBe(true)
        for (const [key, value] of Object.entries(attributes)) {
          expect(key, name).toMatch(/^[a-z0-9]+$/i)
          expect(value, name).toMatch(/^[-\d.,\sa-zA-Z]+$/)
        }
      }
  })

  // Fails after an upgrade of lucide-react that redrew an icon, until
  // scripts/generate-whiteboard-icons.mjs has been run again.
  it("matches the installed lucide-react", () => {
    const entry = createRequire(import.meta.url).resolve("lucide-react")
    const icons = join(dirname(entry), "..", "esm", "icons")
    for (const [name, node] of Object.entries(ICON_NODES)) {
      const source = readFileSync(join(icons, `${name}.mjs`), "utf8")
      for (const [, attributes] of node)
        for (const value of Object.values(attributes)) expect(source, name).toContain(`"${value}"`)
    }
  })

  it("has nothing for a name it does not know, including ones objects have", () => {
    for (const name of ["nope", "constructor", "toString", "__proto__", "", null]) {
      expect(iconNode(name)).toBeNull()
      expect(iconLabel(name)).toBeNull()
    }
  })
})
