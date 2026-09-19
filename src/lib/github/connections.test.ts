import { describe, expect, it } from "vitest"

import { resolveConnections } from "./connections"

const mapped = new Set([
  "apps",
  "apps/web",
  "services",
  "services/payments",
  "services/payments/internal",
  "services/payments/internal/gateway",
  "services/ledger",
  "worker",
])
const connect = (from: string, to: string, label = "", description = "") => ({ from, to, label, description })

describe("resolveConnections", () => {
  it("joins two nodes on the same whiteboard directly", () => {
    const { edges, warnings } = resolveConnections([connect("services/payments", "services/ledger", "gRPC", "Posts.")], mapped)
    expect(warnings).toEqual([])
    expect(edges).toEqual([
      { board: "services", source: "services/payments", target: "services/ledger", label: "gRPC", description: "Posts." },
    ])
  })

  it("lifts both ends to the whiteboard where their paths part", () => {
    const { edges } = resolveConnections(
      [
        connect("apps/web", "services/payments", "REST"),
        connect("services/payments/internal/gateway", "services/ledger", "refunds"),
        connect("worker", "services/payments/internal/gateway", "jobs"),
      ],
      mapped
    )
    expect(edges.map(({ board, source, target }) => [board, source, target])).toEqual([
      ["", "apps", "services"],
      ["services", "services/payments", "services/ledger"],
      ["", "worker", "services"],
    ])
  })

  it("draws one arrow for connections that lift to the same pair", () => {
    const { edges } = resolveConnections(
      [
        connect("apps/web", "services/payments"),
        connect("apps/web", "services/ledger", "REST", "Reads balances."),
        connect("apps", "services", "ignored"),
      ],
      mapped
    )
    expect(edges).toEqual([{ board: "", source: "apps", target: "services", label: "REST", description: "Reads balances." }])
  })

  it("keeps opposite directions apart", () => {
    const { edges } = resolveConnections(
      [connect("services/payments", "services/ledger"), connect("services/ledger", "services/payments")],
      mapped
    )
    expect(edges).toHaveLength(2)
  })

  it("draws a target below the diagram to the nearest folder on it", () => {
    const { edges } = resolveConnections([connect("worker", "services/ledger/internal/db/migrations")], mapped)
    expect(edges[0]).toMatchObject({ board: "", source: "worker", target: "services" })
  })

  it("warns about what cannot be drawn", () => {
    const { edges, warnings } = resolveConnections(
      [
        connect("worker", "nowhere/at/all"),
        connect("services/payments", "services/payments"),
        connect("services/payments", "services"),
        connect("services", "services/payments/internal"),
        connect("", "worker"),
        connect("unmapped", "worker"),
      ],
      mapped
    )
    expect(edges).toEqual([])
    expect(warnings).toHaveLength(6)
    expect(warnings[0]).toContain("worker/.subcanvas")
  })
})
