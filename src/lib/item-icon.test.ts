import { describe, expect, it } from "vitest"

import { itemIconFrom, readItemIcon } from "./item-icon"

describe("readItemIcon", () => {
  it("reads an emoji, or an icon with its color", () => {
    expect(readItemIcon({ emoji: "🚀" })).toEqual({ emoji: "🚀" })
    expect(readItemIcon({ icon: "database", color: "green" })).toEqual({ icon: "database", color: "green" })
  })

  it("reads an icon without a color as the ink of the text", () => {
    expect(readItemIcon({ icon: "database" })).toEqual({ icon: "database", color: "default" })
    expect(readItemIcon({ icon: "database", color: "chartreuse" })).toEqual({ icon: "database", color: "default" })
  })

  it("reads anything else as no icon", () => {
    for (const value of [null, undefined, "🚀", [], {}, { emoji: "two 🚀🚀" }, { icon: "Not A Name" }, { emoji: 3 }])
      expect(readItemIcon(value)).toBeNull()
  })
})

describe("itemIconFrom", () => {
  it("takes one emoji, or one of the icons there are, in a color", () => {
    expect(itemIconFrom({ emoji: " 🧪 " })).toEqual({ icon: { emoji: "🧪" } })
    expect(itemIconFrom({ icon: "database", color: "blue" })).toEqual({ icon: { icon: "database", color: "blue" } })
    expect(itemIconFrom({ icon: "database" })).toEqual({ icon: { icon: "database", color: "default" } })
  })

  it("takes nothing as taking the icon off", () => {
    expect(itemIconFrom({})).toEqual({ icon: null })
    expect(itemIconFrom({ emoji: null, icon: null })).toEqual({ icon: null })
  })

  it("says what is wrong with anything else", () => {
    expect(itemIconFrom({ emoji: "🚀", icon: "database" })).toEqual({ error: "Choose an emoji or an icon, not both." })
    expect(itemIconFrom({ emoji: "rocket" })).toEqual({ error: "That is not a single emoji." })
    // A name in the right form that this version cannot draw.
    expect(itemIconFrom({ icon: "no-such-icon-here" })).toMatchObject({ error: expect.stringContaining("no-such-icon-here") })
    expect(itemIconFrom({ icon: "database", color: "chartreuse" })).toEqual({ error: "That is not one of the colors." })
  })
})
