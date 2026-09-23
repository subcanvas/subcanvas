import { expect, test } from "@playwright/test"

import { signUpWithOrg } from "./support/app"
import { documentedTools, MCP_PATH, readClipboard } from "./support/mcp"

// The page that gets an agent connected: the address, and the shortest way
// into each client, all built from the address the page was served on.

test("shows the server address and a way in for every client", async ({ page, baseURL }) => {
  const { slug } = await signUpWithOrg(page)
  await page.getByRole("link", { name: "Connect an agent" }).click()
  await page.waitForURL(`/${slug}/agents`)
  await expect(page.getByRole("heading", { name: "Connect an agent" })).toBeVisible()

  const url = `${baseURL}${MCP_PATH}`
  // Exact: the address is also inside every command below it.
  await expect(page.getByText(url, { exact: true })).toBeVisible()

  // The copy button really copies the address.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL })
  await page.getByRole("button", { name: "Copy the server address" }).click()
  await expect(page.getByRole("button", { name: "Copy the server address" })).toHaveText(/Copied/)
  expect(await readClipboard(page)).toBe(url)

  // The two command-line clients: one command each, naming the server.
  await expect(page.getByText(`claude mcp add --transport http subcanvas ${url}`, { exact: true })).toBeVisible()
  await expect(
    page.getByText(`codex mcp add subcanvas --url ${url} && codex mcp login subcanvas`, { exact: true })
  ).toBeVisible()

  // Cursor's deep link carries the server's mcp.json entry, base64-encoded.
  const cursor = new URL((await page.getByRole("link", { name: "Add to Cursor" }).getAttribute("href")) ?? "")
  expect(cursor.protocol).toBe("cursor:")
  expect(cursor.host).toBe("anysphere.cursor-deeplink")
  expect(cursor.pathname).toBe("/mcp/install")
  expect(cursor.searchParams.get("name")).toBe("subcanvas")
  expect(JSON.parse(atob(cursor.searchParams.get("config") ?? ""))).toEqual({ url })

  // VS Code's carries the entry as URL-encoded JSON after the question mark.
  const vscode = new URL((await page.getByRole("link", { name: "Add to VS Code" }).getAttribute("href")) ?? "")
  expect(vscode.protocol).toBe("vscode:")
  expect(vscode.pathname).toBe("mcp/install")
  expect(JSON.parse(decodeURIComponent(vscode.search.slice(1)))).toEqual({ name: "subcanvas", type: "http", url })

  // The clients without a link get their steps, and the address is what
  // they paste.
  for (const client of ["Claude (claude.ai and desktop)", "ChatGPT", "Anything else"])
    await expect(page.getByRole("heading", { name: client })).toBeVisible()
})

test("lists every documented tool", async ({ page }) => {
  const { slug } = await signUpWithOrg(page)
  await page.goto(`/${slug}/agents`)
  await expect(page.getByRole("heading", { name: "What an agent can do here" })).toBeVisible()

  // The same table as docs/MCP.md, and nothing more: the names on the page
  // are the ones an agent will be shown.
  const shown = await page.locator("main li code").allTextContents()
  expect(shown.sort()).toEqual(documentedTools().sort())
})
