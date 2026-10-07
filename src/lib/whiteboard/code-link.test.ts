import { describe, expect, it } from "vitest"

import { codeLinkOf, codeLinkText, codeUrlFromInput, describeCodeUrl, parseCodeUrl } from "./code-link"
import { MAX_CODE_URL } from "./limits"

const REPOSITORY = { provider: "github" as const, repository: "acme/shop", ref: "main", commit: "abc123" }

describe("parseCodeUrl", () => {
  it("keeps an https address as it was written, trimmed", () => {
    expect(parseCodeUrl(" https://github.com/acme/shop/blob/main/src/index.ts#L10-L20 ")).toBe(
      "https://github.com/acme/shop/blob/main/src/index.ts#L10-L20"
    )
    expect(parseCodeUrl("https://sourcegraph.com/search?q=repo:acme")).toBe("https://sourcegraph.com/search?q=repo:acme")
  })

  it("refuses anything that is not a plain https address", () => {
    for (const value of [
      "http://github.com/acme/shop",
      "javascript:alert(1)",
      "data:text/html,hi",
      "ftp://example.com/file",
      "https://user:secret@github.com/acme/shop",
      "https://localhost/file",
      "https://github.com/acme/shop with spaces",
      "github.com/acme/shop",
      "",
      "   ",
      42,
      null,
      undefined,
      { url: "https://github.com" },
    ])
      expect(parseCodeUrl(value), String(value)).toBeNull()
  })

  it("refuses an address longer than the limit", () => {
    const base = "https://example.com/"
    expect(parseCodeUrl(base + "a".repeat(MAX_CODE_URL - base.length))).not.toBeNull()
    expect(parseCodeUrl(base + "a".repeat(MAX_CODE_URL - base.length + 1))).toBeNull()
  })
})

describe("codeUrlFromInput", () => {
  it("takes an address without its scheme to mean https", () => {
    expect(codeUrlFromInput("github.com/acme/shop/tree/main/src")).toEqual({ url: "https://github.com/acme/shop/tree/main/src" })
  })

  it("treats an empty field as no link", () => {
    expect(codeUrlFromInput("  ")).toEqual({ url: null })
  })

  it("says why an address cannot be a link", () => {
    expect(codeUrlFromInput("http://github.com/acme/shop")).toEqual({ problem: "Only https links can be added." })
    expect(codeUrlFromInput("not a link")).toHaveProperty("problem")
    expect(codeUrlFromInput("javascript:alert(1)")).toHaveProperty("problem")
    expect(codeUrlFromInput(`https://example.com/${"a".repeat(MAX_CODE_URL)}`)).toHaveProperty("problem")
  })
})

describe("describeCodeUrl", () => {
  it("names a GitHub file by its path and lines, with the repository beside it", () => {
    expect(describeCodeUrl("https://github.com/facebook/react/blob/main/packages/react/src/index.ts#L10-L20")).toEqual({
      label: "packages/react/src/index.ts:10-20",
      repository: "facebook/react",
    })
    expect(describeCodeUrl("https://github.com/facebook/react/blob/v18.2.0/packages/react/index.js#L7").label).toBe(
      "packages/react/index.js:7"
    )
    expect(describeCodeUrl("https://github.com/acme/shop/blob/abc/src/a.ts#L3C5-L9C2").label).toBe("src/a.ts:3-9")
    expect(describeCodeUrl("https://github.com/acme/shop/blob/abc/src/a.ts#L4-L4").label).toBe("src/a.ts:4")
    expect(describeCodeUrl("https://www.github.com/acme/shop/blob/main/README.md").label).toBe("README.md")
  })

  it("names a GitHub folder by its path", () => {
    expect(describeCodeUrl("https://github.com/acme/shop/tree/main/services/payments/")).toEqual({
      label: "services/payments",
      repository: "acme/shop",
    })
    expect(describeCodeUrl("https://github.com/acme/shop/tree/main/src/caf%C3%A9").label).toBe("src/café")
  })

  it("names a repository by itself", () => {
    expect(describeCodeUrl("https://github.com/acme/shop")).toEqual({ label: "acme/shop", repository: null })
    expect(describeCodeUrl("https://github.com/acme/shop.git")).toEqual({ label: "acme/shop", repository: null })
    expect(describeCodeUrl("https://github.com/acme/shop/tree/main")).toEqual({ label: "acme/shop", repository: null })
  })

  it("names anything else in a repository by what follows it", () => {
    expect(describeCodeUrl("https://github.com/acme/shop/pull/12")).toEqual({ label: "pull/12", repository: "acme/shop" })
  })

  it("reads GitLab addresses, nested groups and self-hosted servers included", () => {
    expect(describeCodeUrl("https://gitlab.com/gitlab-org/gitlab/-/blob/master/app/models/user.rb#L10-20")).toEqual({
      label: "app/models/user.rb:10-20",
      repository: "gitlab-org/gitlab",
    })
    expect(describeCodeUrl("https://git.example.com/group/sub/project/-/tree/main/lib")).toEqual({
      label: "lib",
      repository: "group/sub/project",
    })
    expect(describeCodeUrl("https://gitlab.com/acme/shop/-/blob/main/a.go#L5").label).toBe("a.go:5")
  })

  it("reads Bitbucket addresses", () => {
    expect(describeCodeUrl("https://bitbucket.org/acme/shop/src/main/src/app.py#lines-10:20")).toEqual({
      label: "src/app.py:10-20",
      repository: "acme/shop",
    })
  })

  it("reads Gitea and Forgejo addresses, Codeberg's among them", () => {
    expect(describeCodeUrl("https://codeberg.org/forgejo/forgejo/src/branch/forgejo/models/user.go#L10-L12")).toEqual({
      label: "models/user.go:10-12",
      repository: "forgejo/forgejo",
    })
  })

  it("shows any other address as its host and path", () => {
    expect(describeCodeUrl("https://docs.rs/serde/latest/serde/")).toEqual({ label: "docs.rs/serde/latest/serde", repository: null })
    expect(describeCodeUrl("https://example.com/")).toEqual({ label: "example.com", repository: null })
    expect(describeCodeUrl("https://example.com/a?b=c#d")).toEqual({ label: "example.com/a", repository: null })
  })

  it("puts it in one line for a tooltip or a screen reader", () => {
    expect(codeLinkText("https://github.com/acme/shop/blob/main/src/a.ts#L1-L2")).toBe("src/a.ts:1-2 in acme/shop")
    expect(codeLinkText("https://github.com/acme/shop")).toBe("acme/shop")
  })
})

describe("codeLinkOf", () => {
  it("prefers the object's own link", () => {
    const own = "https://github.com/acme/shop/blob/main/services/payments/charge.ts"
    expect(codeLinkOf({ codeUrl: own, path: "services/payments" }, REPOSITORY)).toEqual({ url: own, derived: false })
  })

  it("links an imported folder's box to that folder at the imported branch", () => {
    expect(codeLinkOf({ codeUrl: null, path: "services/payments" }, REPOSITORY)).toEqual({
      url: "https://github.com/acme/shop/tree/main/services/payments",
      derived: true,
    })
    expect(
      codeLinkOf({ codeUrl: null, path: "src/my app" }, { ...REPOSITORY, ref: "release/2" })?.url
    ).toBe("https://github.com/acme/shop/tree/release/2/src/my%20app")
  })

  it("has nothing to link without a link, a folder, or a repository", () => {
    expect(codeLinkOf({ codeUrl: null, path: "services/payments" }, null)).toBeNull()
    expect(codeLinkOf({ codeUrl: null, path: null }, REPOSITORY)).toBeNull()
    expect(codeLinkOf({ codeUrl: null }, REPOSITORY)).toBeNull()
  })
})
