import { expect, it } from "vitest"

import { isPublicAddress } from "./address"

it("lets the open internet through", () => {
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])
    expect(isPublicAddress(address), address).toBe(true)
})

it("refuses this server's own networks, and the cloud's metadata service", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.9",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::a00:1",
    "not an address",
  ])
    expect(isPublicAddress(address), address).toBe(false)
})

it("keeps the edges of the private ranges straight", () => {
  expect(isPublicAddress("172.15.255.255")).toBe(true)
  expect(isPublicAddress("172.32.0.0")).toBe(true)
  expect(isPublicAddress("11.0.0.0")).toBe(true)
})
