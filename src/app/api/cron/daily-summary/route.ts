import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { emailConfigured, sendEmail } from "@/lib/email"
import { dailySummaryEmail, type DailyActivity } from "@/lib/email-messages"
import { operatorContact } from "@/lib/legal"
import { createAdminClient } from "@/lib/supabase/admin"

// Emails the operator a summary of a day (UTC): the accounts that signed up
// and the steps each reached, the accounts that came back, and totals, from
// the step record (lib/activity.ts). Yesterday by default; `?day=2026-10-05`
// for another.
//
// Vercel's cron calls it each morning (vercel.json) with
// `Authorization: Bearer <CRON_SECRET>`. Any other scheduler can call it the
// same way (docs/DEPLOYMENT.md). Without CRON_SECRET nothing may call it: it
// reads every account with the secret key.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret)
    return NextResponse.json({ error: "CRON_SECRET is not set, so nothing may call this." }, { status: 503 })
  if (!authorized(request.headers.get("authorization"), secret))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const day = request.nextUrl.searchParams.get("day") ?? yesterday()
  if (!isDay(day)) return NextResponse.json({ error: "Give the day as YYYY-MM-DD." }, { status: 400 })

  const to = operatorContact()
  if (!emailConfigured() || !to)
    return NextResponse.json({
      sent: false,
      reason: "This server emails no operator. Set SMTP_HOST, and OPERATOR_EMAIL or LEGAL_CONTACT.",
    })
  if (!process.env.SUPABASE_SECRET_KEY)
    return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set, so the day cannot be read." }, { status: 503 })

  const { data, error } = await createAdminClient().rpc("daily_activity", { p_day: day })
  if (error || !data) {
    console.error(`Reading the activity of ${day} failed:`, error?.message)
    return NextResponse.json({ error: "The day could not be read." }, { status: 500 })
  }

  const result = await sendEmail({ to, ...dailySummaryEmail(data as DailyActivity) })
  if (result !== "sent") return NextResponse.json({ error: "The summary could not be sent." }, { status: 500 })
  return NextResponse.json({ sent: true, day })
}

// Compared in constant time, so the answer's timing says nothing about how
// much of a guess was right.
function authorized(header: string | null, secret: string) {
  if (!header) return false
  const given = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

function yesterday() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
}

// A real calendar day: 2026-02-30 is not one.
function isDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const date = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day
}
