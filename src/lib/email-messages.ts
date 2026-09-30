import type { Role } from "@/lib/roles"

// What the app's emails say (lib/email.ts sends them). Each is plain text
// with a simple HTML version of the same words. Names come from people, so
// every one of them is escaped in the HTML and kept to one line in a subject.

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ENTITIES[c])

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim()

// The same instant for every reader, wherever they are.
const EXPIRY = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" })
export const formatExpiry = (date: Date) => `${EXPIRY.format(date)} UTC`

const ROLE_PHRASES: Record<Exclude<Role, "owner">, string> = {
  viewer: "a viewer",
  editor: "an editor",
  admin: "an admin",
}

// The Sheets palette (globals.css), inlined: mail clients ignore stylesheets.
const INK = "#10162f"
const GRAPHITE = "#59627a"
const COBALT = "#2447f9"

// A sheet on paper, with a line of small print under it.
function layout(body: string, footer: string) {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f6fa">
<div style="max-width:520px;margin:0 auto;padding:32px 16px;font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:${INK}">
<div style="background:#ffffff;border:1px solid #dde3ee;border-radius:12px;padding:28px">
${body}
</div>
<p style="margin:16px 4px 0;font-size:13px;color:${GRAPHITE}">${footer}</p>
</div>
</body>
</html>
`
}

const paragraph = (html: string, style = "") => `<p style="margin:0 0 16px;${style}">${html}</p>`

export type InviteEmail = {
  // Who sent it: their name, or their address when they have none.
  inviter: string
  workspace: string
  role: Exclude<Role, "owner">
  // The invited address. The invite works for this address only.
  email: string
  link: string
  expiresAt: Date
}

export function inviteEmail({ inviter, workspace, role, email, link, expiresAt }: InviteEmail) {
  const expiry = formatExpiry(expiresAt)
  const about =
    "Subcanvas: turn a GitHub repo into a diagram you can click into. Any box or arrow can hold a whiteboard or a page of its own. If you were not expecting this invite, you can ignore it."

  const text = `${inviter} invited you to join ${workspace} on Subcanvas as ${ROLE_PHRASES[role]}.

Accept the invite:
${link}

The link is for ${email} only: sign in or create an account with that address to accept it. It works once, until ${expiry}.

${about}
`

  const html = layout(
    [
      paragraph(
        `<strong>${escapeHtml(inviter)}</strong> invited you to join <strong>${escapeHtml(workspace)}</strong> on Subcanvas as ${ROLE_PHRASES[role]}.`
      ),
      `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:${COBALT};color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">Accept the invite</a></p>`,
      paragraph(
        `The link is for ${escapeHtml(email)} only: sign in or create an account with that address to accept it. It works once, until ${escapeHtml(expiry)}.`,
        `font-size:14px;color:${GRAPHITE}`
      ),
      `<p style="margin:0;font-size:13px;color:${GRAPHITE};word-break:break-all">If the button does not open, copy this address into your browser: <a href="${escapeHtml(link)}" style="color:${COBALT}">${escapeHtml(link)}</a></p>`,
    ].join("\n"),
    escapeHtml(about)
  )

  return { subject: oneLine(`${inviter} invited you to ${workspace} on Subcanvas`), text, html }
}

export type AbuseReportEmail = {
  reportId: string
  projectName: string
  projectLink: string
  // The document the reporter was on, when they were on one.
  document: { title: string; link: string; type: "whiteboard" | "text" } | null
  reason: string
  reporterEmail: string | null
  // Where this server's operator procedures are written down.
  procedures: string
  projectId: string
}

// To the operator, who reviews the project and decides whether to take it
// down. A reply goes to the reporter when they left an address.
export function abuseReportEmail(report: AbuseReportEmail) {
  const kind = report.document?.type === "whiteboard" ? "Whiteboard" : "Page"
  const takedown = `update public.projects set taken_down_at = now() where id = '${report.projectId}';`
  const lines = [
    "Someone reported a public project.",
    "",
    `Project: ${report.projectName}`,
    report.projectLink,
    ...(report.document ? ["", `${kind}: ${report.document.title}`, report.document.link] : []),
    "",
    "Reason:",
    report.reason,
    "",
    `Reporter: ${report.reporterEmail ?? "no email given"}`,
    `Report: ${report.reportId}`,
    "",
    "To take the project down:",
    takedown,
    "",
    `Reviewing a report, taking a project down, and reversing it: ${report.procedures}`,
  ]

  const link = (href: string) => `<a href="${escapeHtml(href)}" style="color:${COBALT}">${escapeHtml(href)}</a>`
  const html = layout(
    [
      paragraph("Someone reported a public project."),
      paragraph(
        `<strong>Project:</strong> ${escapeHtml(report.projectName)}<br>${link(report.projectLink)}` +
          (report.document
            ? `<br><strong>${kind}:</strong> ${escapeHtml(report.document.title)}<br>${link(report.document.link)}`
            : "")
      ),
      paragraph(`<strong>Reason:</strong><br>${escapeHtml(report.reason)}`, "white-space:pre-wrap"),
      paragraph(
        `<strong>Reporter:</strong> ${escapeHtml(report.reporterEmail ?? "no email given")}<br><strong>Report:</strong> ${escapeHtml(report.reportId)}`
      ),
      paragraph("To take the project down:", "margin-bottom:4px"),
      `<pre style="margin:0;padding:12px;background:#f4f6fa;border-radius:8px;font-size:12px;white-space:pre-wrap;word-break:break-all">${escapeHtml(takedown)}</pre>`,
    ].join("\n"),
    `Reviewing a report, taking a project down, and reversing it: ${link(report.procedures)}`
  )

  return {
    subject: oneLine(`Report: ${report.projectName}`),
    text: `${lines.join("\n")}\n`,
    html,
  }
}
