import { describe, expect, it } from "vitest"

import { parseRepositoryReference } from "./reference"

describe("parseRepositoryReference", () => {
  it.each([
    ["vercel/turborepo", "vercel", "turborepo"],
    ["  supabase/supabase  ", "supabase", "supabase"],
    ["https://github.com/vercel/next.js", "vercel", "next.js"],
    ["https://github.com/vercel/next.js.git", "vercel", "next.js"],
    ["http://www.github.com/a/b/", "a", "b"],
    ["github.com/a-b/c_d", "a-b", "c_d"],
    ["https://github.com/a/b/tree/main/packages/ui?tab=readme#top", "a", "b"],
  ])("reads %s", (input, owner, name) => {
    expect(parseRepositoryReference(input)).toEqual({ owner, name })
  })

  it.each([
    "",
    "turborepo",
    "a/b/c",
    "https://gitlab.com/a/b",
    "https://github.com.evil.example/a/b",
    "https://evil.example/github.com/a/b",
    "https://evil.example/?x=github.com/a/b",
    "https://user@github.com/a/b",
    "https://github.com:8080/a/b",
    "http://127.0.0.1/a/b",
    "-a/b",
    "a/..",
    "a/.git",
    "a/b c",
    "a/b\nc",
    "../../etc/passwd",
    "a/%2e%2e",
    `a/${"b".repeat(101)}`,
    `${"a".repeat(40)}/b`,
  ])("refuses %j", (input) => {
    expect(parseRepositoryReference(input)).toBeNull()
  })
})
