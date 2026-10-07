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

// The steps of the step record (migration account_steps), in the order a new
// account usually meets them, as the operator reads them.
export const STEP_LABELS: Record<string, string> = {
  signed_up: "Signed up",
  opened_github_import: "Opened Import from GitHub",
  imported_repository: "Imported a repository",
  imported_files: "Imported files",
  created_project: "Created a project",
  created_whiteboard: "Created a whiteboard",
  made_edit: "Made an edit",
  invited_someone: "Invited someone",
  connected_agent: "Connected an agent",
  opened_billing: "Opened Billing",
  upgraded: "Upgraded to Pro",
  came_back: "Came back on a later day",
}

const stepLabel = (step: string) => STEP_LABELS[step] ?? step

const METHODS: Record<string, string> = { email: "Email", google: "Google", github: "GitHub" }
export const signUpMethod = (method: string) => METHODS[method] ?? method

const DAY = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" })
const TIME = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "UTC" })
const DAY_AND_TIME = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })

const OPERATOR_FOOTER = "Sent to the operator of this Subcanvas server. What each account does is in private.account_activity (docs/OPERATIONS.md)."

export type SignUpEmail = {
  email: string
  // From Google or GitHub; null for an email sign-up.
  name: string | null
  // How the account was made: email, google or github.
  method: string
  at: Date
}

// To the operator, once per new account. No links: it says who, how and when.
export function signUpEmail({ email, name, method, at }: SignUpEmail) {
  const who = name?.trim() ? `${oneLine(name)}, ${email}` : email
  const when = formatExpiry(at)
  const how = signUpMethod(method)
  const text = `Someone signed up for Subcanvas.

Who: ${who}
How: ${how}
When: ${when}

${OPERATOR_FOOTER}
`
  const html = layout(
    [
      paragraph("Someone signed up for Subcanvas."),
      paragraph(
        `<strong>Who:</strong> ${escapeHtml(who)}<br><strong>How:</strong> ${escapeHtml(how)}<br><strong>When:</strong> ${escapeHtml(when)}`,
        "margin:0"
      ),
    ].join("\n"),
    escapeHtml(OPERATOR_FOOTER)
  )
  return { subject: oneLine(`New account: ${email}`), text, html }
}

export type ActivityAccount = {
  email: string
  signed_up_at: string
  signed_up_with: string
  steps: { step: string; at: string }[]
}

// What public.daily_activity returns for a UTC day.
export type DailyActivity = {
  day: string
  accounts: number
  new: ActivityAccount[]
  returning: ActivityAccount[]
  steps: Record<string, number>
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// What public.daily_errors returns for a UTC day: the five errors that
// happened most, from the app's own error reports (lib/errors).
export type DailyErrors = {
  occurrences: number
  distinct: number
  top: {
    source: "server" | "browser"
    route: string
    name: string
    message: string
    count: number
    first_seen: string
    new: boolean
  }[]
}

// To the operator, each morning, about the day before: who signed up and how
// far each got, who came back and what they did, and how many reached each
// step. No links, and only what the step record and the accounts hold.
export function dailySummaryEmail(activity: DailyActivity, errors?: DailyErrors) {
  const day = DAY.format(new Date(`${activity.day}T00:00:00Z`))
  // A step on the day itself shows its time; one after it, its date too.
  const at = (iso: string) => {
    const date = new Date(iso)
    return date.toISOString().slice(0, 10) === activity.day ? TIME.format(date) : DAY_AND_TIME.format(date)
  }
  const totals = [
    `New accounts: ${activity.new.length}`,
    `Returning accounts: ${activity.returning.length}`,
    `Accounts in all: ${activity.accounts}`,
  ]
  // Errors: how many times anything went wrong, and the five that did most.
  const errorTotal = errors?.occurrences
    ? `Errors that day: ${count(errors.occurrences, "time", "times")}, ${count(errors.distinct, "distinct error", "distinct errors")}`
    : errors
      ? "Errors that day: none"
      : null
  const errorLines = (errors?.top ?? []).map(
    (error) =>
      `${count(error.count, "time", "times")}  ${error.route} (${error.source})  ${error.name}: ${error.message}  ${
        error.new ? "New" : `First seen ${DAY.format(new Date(error.first_seen))}`
      }`
  )
  const reached = Object.keys(STEP_LABELS)
    .filter((step) => activity.steps[step])
    .map((step) => `${stepLabel(step)}: ${activity.steps[step]}`)

  type Entry = { heading: string; lines: string[] }
  const newEntries: Entry[] = activity.new.map((account) => ({
    heading: `${account.email} (${signUpMethod(account.signed_up_with)}, ${at(account.signed_up_at)})`,
    lines: account.steps.map(({ step, at: when }) => `${at(when)}  ${stepLabel(step)}`),
  }))
  const returningEntries: Entry[] = activity.returning.map((account) => ({
    heading: `${account.email} (signed up ${DAY.format(new Date(account.signed_up_at))})`,
    lines: account.steps.length
      ? account.steps.map(({ step }) => stepLabel(step))
      : ["No step reached for the first time"],
  }))

  const textEntries = (entries: Entry[], none: string) =>
    entries.length
      ? entries.map(({ heading, lines }) => [heading, ...lines.map((line) => `  ${line}`)].join("\n")).join("\n\n")
      : none
  const text = `${day} (UTC)

${totals.join("\n")}

New accounts, and the steps each has reached so far:

${textEntries(newEntries, "Nobody signed up.")}

Returning accounts, and the steps each reached for the first time that day:

${textEntries(returningEntries, "Nobody who signed up earlier was active.")}

Steps reached for the first time that day:
${reached.length ? reached.map((line) => `  ${line}`).join("\n") : "  None"}
${errorTotal ? `\n${errorTotal}${errorLines.map((line) => `\n  ${line}`).join("")}\n` : ""}
${OPERATOR_FOOTER}
`

  const heading = (words: string) => paragraph(`<strong>${escapeHtml(words)}</strong>`, "margin:24px 0 8px")
  const list = (lines: string[]) =>
    `<ul style="margin:4px 0 12px;padding-left:20px">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
  const htmlEntries = (entries: Entry[], none: string) =>
    entries.length
      ? entries.map(({ heading: title, lines }) => paragraph(escapeHtml(title), "margin:0") + list(lines)).join("\n")
      : paragraph(escapeHtml(none), `color:${GRAPHITE}`)
  const html = layout(
    [
      paragraph(`<strong>${escapeHtml(day)}</strong> (UTC)`),
      paragraph(totals.map(escapeHtml).join("<br>"), "margin:0"),
      heading("New accounts, and the steps each has reached so far"),
      htmlEntries(newEntries, "Nobody signed up."),
      heading("Returning accounts, and the steps each reached for the first time that day"),
      htmlEntries(returningEntries, "Nobody who signed up earlier was active."),
      heading("Steps reached for the first time that day"),
      reached.length ? list(reached) : paragraph("None", `color:${GRAPHITE}`),
      ...(errorTotal ? [heading(errorTotal), ...(errorLines.length ? [list(errorLines)] : [])] : []),
    ].join("\n"),
    escapeHtml(OPERATOR_FOOTER)
  )

  return {
    subject: `Subcanvas, ${day}: ${count(activity.new.length, "new account", "new accounts")}, ${activity.returning.length} returning`,
    text,
    html,
  }
}
