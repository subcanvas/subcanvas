import { describe, expect, it } from "vitest"

import { limitMessage, upgradeFor } from "./limit"

describe("plan limit refusals", () => {
  it("say what the limit is, with the number the database gave, and never offer the upgrade themselves", () => {
    const documents = limitMessage("GN001", "This would take the workspace past the free limit of 100 private whiteboards and pages.")
    expect(documents).toBe(
      "This would take the workspace past the free plan's 100 private documents. Documents in public projects and in the trash do not count."
    )
    expect(limitMessage("GN002", "The free plan includes 3 editors. Viewers are unlimited.")).toBe(
      "This would take the workspace past the free plan's 3 editors. Viewers are unlimited."
    )
    expect(documents).not.toMatch(/upgrade/i)
    expect(limitMessage("42501", "Not allowed.")).toBeNull()
  })

  it("offer the upgrade to an owner, tell anyone else to ask one, and say neither where no plan is sold", () => {
    expect(upgradeFor("owner", true)).toBe("offer")
    expect(upgradeFor("admin", true)).toBe("ask")
    expect(upgradeFor("editor", true)).toBe("ask")
    expect(upgradeFor("owner", false)).toBeNull()
  })
})
