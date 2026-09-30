import { describe, expect, it } from "vitest"

import { abuseReportEmail, escapeHtml, formatExpiry, inviteEmail } from "./email-messages"

const invite = {
  inviter: "Ada Lovelace",
  workspace: "Analytical Engines",
  role: "editor" as const,
  email: "charles@example.test",
  link: "https://subcanvas.example/invite/7d0c6f7e-4b7e-4c55-9d3e-0f1d0c9e2a11",
  expiresAt: new Date("2026-10-05T18:04:00Z"),
}

describe("inviteEmail", () => {
  it("says who invited them, to what, with what role, the link, and until when", () => {
    const { subject, text, html } = inviteEmail(invite)
    expect(subject).toBe("Ada Lovelace invited you to Analytical Engines on Subcanvas")
    for (const body of [text, html]) {
      expect(body).toContain("Ada Lovelace")
      expect(body).toContain("Analytical Engines")
      expect(body).toContain("as an editor")
      expect(body).toContain(invite.link)
      expect(body).toContain("charles@example.test")
      expect(body).toContain("October 5, 2026")
      expect(body).toContain("UTC")
    }
  })

  it("escapes names in the HTML, which anyone can choose", () => {
    const { html, text } = inviteEmail({
      ...invite,
      inviter: `<img src=x onerror="alert(1)">`,
      workspace: `Tom & Jerry's <b>`,
    })
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
    expect(html).toContain("Tom &amp; Jerry&#39;s &lt;b&gt;")
    // The text version is text: nothing to escape.
    expect(text).toContain(`Tom & Jerry's <b>`)
  })

  it("keeps the subject to one line whatever a name holds", () => {
    const { subject } = inviteEmail({ ...invite, workspace: "Two\r\nBcc: someone@example.test" })
    expect(subject).not.toMatch(/[\r\n]/)
    expect(subject).toBe("Ada Lovelace invited you to Two Bcc: someone@example.test on Subcanvas")
  })
})

describe("abuseReportEmail", () => {
  const report = {
    reportId: "5a4f3e2d-1c0b-4a98-8765-43210fedcba9",
    projectId: "0b5a0f09-b2f6-48d5-b6df-005d5d5469c2",
    projectName: "Free <prizes>",
    projectLink: "https://subcanvas.example/p/0b5a0f09-b2f6-48d5-b6df-005d5d5469c2",
    document: null,
    reason: "Phishing.\nIt asks for passwords.",
    reporterEmail: null,
    procedures: "https://example.test/OPERATIONS.md",
  }

  it("gives the operator the project, the reason, the reporter, and the takedown", () => {
    const { subject, text, html } = abuseReportEmail({
      ...report,
      document: { title: "Sign in", link: `${report.projectLink}/d/6b1c4b7a-d57a-4a12-9217-40f898f7e4b2` },
      reporterEmail: "reader@example.test",
    })
    expect(subject).toBe("Report: Free <prizes>")
    expect(text).toContain(report.projectLink)
    expect(text).toContain("Page: Sign in")
    expect(text).toContain("Phishing.\nIt asks for passwords.")
    expect(text).toContain("Reporter: reader@example.test")
    expect(text).toContain(`update public.projects set taken_down_at = now() where id = '${report.projectId}';`)
    expect(html).toContain("Free &lt;prizes&gt;")
    expect(html).toContain(report.procedures)
  })

  it("says when the reporter left no address", () => {
    expect(abuseReportEmail(report).text).toContain("Reporter: no email given")
  })
})

describe("escapeHtml and formatExpiry", () => {
  it("escape the five characters that matter", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
  })

  it("name the same instant for every reader", () => {
    expect(formatExpiry(new Date("2026-10-05T18:04:00Z"))).toMatch(/^October 5, 2026 at 6:04\sPM UTC$/)
  })
})
