import { expect, it } from "vitest"

import { readClosedSections, writeClosedSections } from "./sidebar-state"

it("reads back what it wrote", () => {
  expect(readClosedSections(writeClosedSections(["acme", "e2e-123-team"]))).toEqual(["acme", "e2e-123-team"])
  expect(readClosedSections(writeClosedSections([]))).toEqual([])
})

it("forgets anything that is not a slug", () => {
  expect(readClosedSections(undefined)).toEqual([])
  expect(readClosedSections("%E0%A4%A")).toEqual([])
  expect(readClosedSections(encodeURIComponent("acme,<script>,Team"))).toEqual(["acme"])
})
