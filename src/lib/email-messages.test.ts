import { describe, expect, it } from "vitest"

import {
  abuseReportEmail,
  dailySummaryEmail,
  escapeHtml,
  formatExpiry,
  inviteEmail,
  signUpEmail,
  type DailyActivity,
} from "./email-messages"

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

  it("says the workspace's name once, even when it ends in \"workspace\"", () => {
    const { text, html } = inviteEmail({ ...invite, workspace: "Acme workspace" })
    expect(text).toContain("invited you to join Acme workspace on Subcanvas as an editor.")
    expect(html).toContain("<strong>Acme workspace</strong> on Subcanvas")
    expect(`${text}${html}`).not.toMatch(/workspace\W+workspace/)
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
      document: { title: "Sign in", link: `${report.projectLink}/d/6b1c4b7a-d57a-4a12-9217-40f898f7e4b2`, type: "text" as const },
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

  it("names a reported whiteboard as a whiteboard", () => {
    const { text, html } = abuseReportEmail({
      ...report,
      document: { title: "Login flow", link: `${report.projectLink}/d/6b1c4b7a-d57a-4a12-9217-40f898f7e4b2`, type: "whiteboard" },
    })
    expect(text).toContain("Whiteboard: Login flow")
    expect(text).not.toContain("Page:")
    expect(html).toContain("<strong>Whiteboard:</strong> Login flow")
  })

  it("says when the reporter left no address", () => {
    expect(abuseReportEmail(report).text).toContain("Reporter: no email given")
  })
})

describe("signUpEmail", () => {
  const signUp = { email: "ada@example.test", name: null, method: "email", at: new Date("2026-10-05T18:04:00Z") }

  it("tells the operator who signed up, how, and when", () => {
    const { subject, text, html } = signUpEmail({ ...signUp, name: "Ada Lovelace", method: "google" })
    expect(subject).toBe("New account: ada@example.test")
    for (const body of [text, html]) {
      expect(body).toContain("Ada Lovelace, ada@example.test")
      expect(body).toContain("Google")
      expect(body).toMatch(/October 5, 2026 at 6:04\sPM UTC/)
    }
  })

  it("names each way of signing up as the sign-in page does", () => {
    expect(signUpEmail(signUp).text).toContain("How: Email")
    expect(signUpEmail({ ...signUp, method: "github" }).text).toContain("How: GitHub")
  })

  it("has no links: nothing to click, nothing to track", () => {
    const { text, html } = signUpEmail({ ...signUp, name: "Ada" })
    expect(text).not.toMatch(/https?:/)
    expect(html).not.toMatch(/https?:|<a /)
  })

  it("escapes a name, which anyone can choose, and keeps the subject to one line", () => {
    const { html, subject } = signUpEmail({ ...signUp, name: `<img src=x onerror="alert(1)">`, email: "a@b.test\r\nBcc: c@d.test" })
    expect(html).not.toContain("<img src=x")
    expect(subject).not.toMatch(/[\r\n]/)
  })
})

describe("dailySummaryEmail", () => {
  const activity: DailyActivity = {
    day: "2026-10-05",
    accounts: 42,
    new: [
      {
        email: "ada@example.test",
        signed_up_at: "2026-10-05T18:04:00Z",
        signed_up_with: "github",
        steps: [
          { step: "signed_up", at: "2026-10-05T18:04:00Z" },
          { step: "opened_github_import", at: "2026-10-05T18:05:00Z" },
          { step: "imported_repository", at: "2026-10-05T18:06:00Z" },
          { step: "made_edit", at: "2026-10-06T01:30:00Z" },
        ],
      },
    ],
    returning: [
      {
        email: "<bob>@example.test",
        signed_up_at: "2026-09-30T09:00:00Z",
        signed_up_with: "email",
        steps: [{ step: "came_back", at: "2026-10-05T10:00:00Z" }],
      },
      { email: "cy@example.test", signed_up_at: "2026-09-29T09:00:00Z", signed_up_with: "google", steps: [] },
    ],
    steps: { signed_up: 1, opened_github_import: 1, imported_repository: 1, came_back: 1 },
  }

  it("says what the day was in its subject", () => {
    expect(dailySummaryEmail(activity).subject).toBe("Subcanvas, October 5, 2026: 1 new account, 2 returning")
  })

  it("gives the totals", () => {
    const { text } = dailySummaryEmail(activity)
    expect(text).toContain("October 5, 2026 (UTC)")
    expect(text).toContain("New accounts: 1\nReturning accounts: 2\nAccounts in all: 42")
  })

  it("lists each new account with how it signed up and every step it reached, in words", () => {
    const { text, html } = dailySummaryEmail(activity)
    expect(text).toMatch(/ada@example\.test \(GitHub, 6:04\sPM\)/)
    expect(text).toMatch(/6:05\sPM {2}Opened Import from GitHub/)
    expect(text).toContain("Imported a repository")
    // After the day, the date is given too.
    expect(text).toMatch(/October 6 at 1:30\sAM {2}Made an edit/)
    expect(html).toContain("Opened Import from GitHub")
  })

  it("lists each returning account with what it did for the first time that day", () => {
    const { text, html } = dailySummaryEmail(activity)
    expect(text).toContain("<bob>@example.test (signed up September 30, 2026)\n  Came back on a later day")
    expect(text).toContain("cy@example.test (signed up September 29, 2026)\n  No step reached for the first time")
    expect(html).toContain("&lt;bob&gt;@example.test")
    expect(html).not.toContain("<bob>")
  })

  it("counts the accounts that reached each step, in the order of the steps", () => {
    const { text } = dailySummaryEmail(activity)
    expect(text).toContain(
      "  Signed up: 1\n  Opened Import from GitHub: 1\n  Imported a repository: 1\n  Came back on a later day: 1"
    )
  })

  it("says so on a quiet day", () => {
    const { subject, text } = dailySummaryEmail({ day: "2026-10-05", accounts: 42, new: [], returning: [], steps: {} })
    expect(subject).toBe("Subcanvas, October 5, 2026: 0 new accounts, 0 returning")
    expect(text).toContain("Nobody signed up.")
    expect(text).toContain("Nobody who signed up earlier was active.")
  })

  it("gives the day's errors: how often, and the ones that happened most", () => {
    const { text, html } = dailySummaryEmail(activity, {
      occurrences: 9,
      distinct: 2,
      top: [
        { source: "browser", route: "/[org]/[project]/d/[docId]", name: "TypeError", message: "x is undefined", count: 7, first_seen: "2026-10-05T10:00:00Z", new: true },
        { source: "server", route: "/[org]", name: "Error", message: "fetch failed", count: 2, first_seen: "2026-09-30T10:00:00Z", new: false },
      ],
    })
    expect(text).toContain("Errors that day: 9 times, 2 distinct errors")
    expect(text).toContain("  7 times  /[org]/[project]/d/[docId] (browser)  TypeError: x is undefined  New")
    expect(text).toContain("  2 times  /[org] (server)  Error: fetch failed  First seen September 30, 2026")
    expect(html).toContain("Errors that day: 9 times, 2 distinct errors")
  })

  it("says when there were no errors, and says nothing of them when they could not be read", () => {
    expect(dailySummaryEmail(activity, { occurrences: 0, distinct: 0, top: [] }).text).toContain("Errors that day: none")
    expect(dailySummaryEmail(activity).text).not.toContain("Errors")
  })

  it("has no links, no em dashes and no exclamation marks", () => {
    const { text, html } = dailySummaryEmail(activity)
    expect(text).not.toMatch(/https?:/)
    expect(html).not.toMatch(/https?:|<a /)
    expect(`${text}${html.replace("<!doctype html>", "")}`).not.toMatch(/\u2014|!/)
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
