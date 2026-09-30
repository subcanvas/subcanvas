import { afterEach, describe, expect, it, vi } from "vitest"

import { emailConfigured, sendEmail } from "./email"

// Only what can be known without a mail server: nothing here connects to
// one. That email really arrives is checked end to end, through Mailpit
// (e2e/invites.spec.ts).

const message = { to: "someone@example.test", subject: "Hello", text: "Hello", html: "<p>Hello</p>" }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("sendEmail", () => {
  it("sends nothing, and says so, on a server without SMTP_HOST", async () => {
    vi.stubEnv("SMTP_HOST", "")
    expect(emailConfigured()).toBe(false)
    expect(await sendEmail(message)).toBe("off")
  })

  it("fails loudly when there is a server to send through but no sender", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test")
    vi.stubEnv("EMAIL_FROM", "")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(emailConfigured()).toBe(true)
    expect(await sendEmail(message)).toBe("failed")
    expect(log).toHaveBeenCalledWith(expect.stringContaining("EMAIL_FROM"))
  })
})
