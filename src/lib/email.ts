import "server-only"

import nodemailer, { type Transporter } from "nodemailer"

// Mail the app sends itself: invitations, and abuse reports to the operator.
// Sign-in links and password resets are not sent from here; Supabase Auth
// sends those through its own SMTP settings.
//
// Configured by SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM
// (docs/DEPLOYMENT.md). Without SMTP_HOST nothing is sent, and callers say
// so: an invite is then a link the admin passes on.

export type Email = { to: string; subject: string; text: string; html: string; replyTo?: string }

// "off": this server sends no email. "failed": it tried, and the reason is
// in the server's log.
export type SendResult = "sent" | "off" | "failed"

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST)
}

let transport: Transporter | undefined

function smtp() {
  const port = Number(process.env.SMTP_PORT) || 587
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 speaks TLS from the first byte. Other ports start in plain text
    // and switch to TLS when the server offers it.
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
      : undefined,
    // Someone is waiting on the answer: an invite says whether its email
    // went. Nodemailer's own defaults wait up to ten minutes.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  return transport
}

export async function sendEmail(email: Email): Promise<SendResult> {
  if (!emailConfigured()) return "off"
  const from = process.env.EMAIL_FROM
  if (!from) {
    console.error("SMTP_HOST is set and EMAIL_FROM is not, so no email was sent.")
    return "failed"
  }
  try {
    await smtp().sendMail({ from, ...email })
    return "sent"
  } catch (error) {
    console.error("Sending an email failed:", error)
    return "failed"
  }
}
