import { describe, expect, it } from "vitest"

import { codeFromSegment, documentHref, documentPermalink, documentSegment, parseVia, projectHref, slugify } from "./navigation"

const project = { slug: "team", project: "ride-hailing" }

describe("addresses", () => {
  it("names a project by its workspace and short name", () => {
    expect(projectHref(project)).toBe("/team/ride-hailing")
  })

  it("puts a document's title before its code", () => {
    expect(documentHref(project, { code: "c28c38dd", title: "Dispatch & matching" })).toBe(
      "/team/ride-hailing/dispatch-matching-c28c38dd"
    )
  })

  it("makes the title readable the way the database makes a project's short name", () => {
    expect(slugify("  System Design: v2! ")).toBe("system-design-v2")
    expect(slugify("a".repeat(70) + " b")).toBe("a".repeat(60))
    expect(slugify("設計")).toBe("")
  })

  it("is the code alone when the title has nothing usable", () => {
    expect(documentSegment({ code: "c28c38dd", title: "設計" })).toBe("c28c38dd")
  })

  it("finds the document by its code whatever the title says", () => {
    expect(codeFromSegment("dispatch-c28c38dd")).toBe("c28c38dd")
    expect(codeFromSegment("an-old-title-c28c38dd00")).toBe("c28c38dd00")
    expect(codeFromSegment("C28C38DD")).toBe("c28c38dd")
    expect(codeFromSegment("trash")).toBeNull()
    expect(codeFromSegment("dispatch-c28c")).toBeNull()
  })

  it("carries the trail as codes, and goes back along it to a document already on it", () => {
    const matcher = { code: "87660022", title: "Matcher" }
    expect(documentHref(project, matcher, ["89f992c0", "c28c38dd"])).toBe(
      "/team/ride-hailing/matcher-87660022?via=89f992c0.c28c38dd"
    )
    expect(documentHref(project, { code: "89f992c0", title: "Overview" }, ["89f992c0", "c28c38dd"])).toBe(
      "/team/ride-hailing/overview-89f992c0"
    )
  })

  it("reads only codes from a trail", () => {
    expect(parseVia("89f992c0.not-a-code.c28c38dd")).toEqual(["89f992c0", "c28c38dd"])
    expect(parseVia(undefined)).toEqual([])
  })

  it("addresses a document by id where only the id is at hand", () => {
    expect(documentPermalink(project, "c28c38dd-8e7d-4ae6-b73c-70dc118d51ef")).toBe(
      "/team/ride-hailing/d/c28c38dd-8e7d-4ae6-b73c-70dc118d51ef"
    )
  })
})
