import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { createMcpHandler } from "@modelcontextprotocol/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createServer } from "./server"

// A client that wants to hear about changes to the tool list asks for them
// with a `subscriptions/listen` request, and the server holds that request
// open to send them. On Vercel a function lives 60 seconds, so each one was
// cut off and reopened, once a minute, for as long as the agent stayed
// connected. The tools never change while an agent is connected, and the
// server says so, so no client opens one.
describe("the MCP server", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("says its tools do not change, so no client holds a request open", async () => {
    const handler = createMcpHandler(() => createServer({ userId: "user", token: "token" }, "http://localhost"))
    const methods: string[] = []
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = new Request(input, init)
        if (request.method === "POST")
          for (const message of [await request.clone().json()].flat()) methods.push(message.method)
        return handler.fetch(request)
      },
    })
    // A client on the 2026-07-28 protocol, the one with listen requests, that
    // would listen if the server let it.
    const client = new Client(
      { name: "test", version: "0.1.0" },
      {
        listChanged: { tools: { onChanged: () => {} } },
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      }
    )
    await client.connect(transport)
    try {
      expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28")
      expect(client.getServerCapabilities()?.tools?.listChanged).toBe(false)
      expect(methods).not.toContain("subscriptions/listen")
      // And it still works: every tool is there.
      const { tools } = await client.listTools()
      expect(tools.length).toBeGreaterThan(10)
    } finally {
      await client.close()
      await handler.close()
    }
  })
})
