import { readFileSync } from "node:fs"
import path from "node:path"

// What the server under test was started with, as far as its email goes:
// the environment, or .env.local when the environment does not say, which is
// where `next start` reads it from too (billing.ts reads the Stripe keys the
// same way). CI sets both for the server and the specs.

function dotEnvLocal(): Record<string, string> {
  let text: string
  try {
    text = readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8")
  } catch {
    return {}
  }
  const values: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2")
  }
  return values
}

const fromFile = dotEnvLocal()
const setting = (name: string) => process.env[name] || fromFile[name] || ""

// The server sends its own email (invites, reports), to Mailpit locally.
export const emailConfigured = Boolean(setting("SMTP_HOST"))

// Where it sends abuse reports, as lib/legal.ts decides.
export const abuseContact = setting("ABUSE_EMAIL") || setting("LEGAL_CONTACT") || null

// Where it emails the operator about new accounts and each day, as
// lib/legal.ts decides.
export const operatorContact = setting("OPERATOR_EMAIL") || setting("LEGAL_CONTACT") || null

// The secret the daily summary's route asks for. Unset, the route refuses
// everyone, and the spec that sends a summary skips.
export const cronSecret = setting("CRON_SECRET") || null
