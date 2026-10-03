import { NextResponse, type NextRequest } from "next/server"

import { receiveReport } from "@/lib/errors/intake"
import { normalizeMessage, normalizeRoute } from "@/lib/errors/normalize"
import { recordError } from "@/lib/errors/record"

// Where the app's pages report an error that happened in the browser
// (components/error-reporter.tsx). What it accepts is in lib/errors/intake;
// at most DAILY_NEW_ERRORS new distinct errors are added a day across
// everyone, so nobody can fill the table, while known ones are still counted.
const DAILY_NEW_ERRORS = 500

export async function POST(request: NextRequest) {
  const intake = await receiveReport(request)
  if ("error" in intake) return NextResponse.json({ error: intake.error }, { status: intake.status })

  const { report } = intake
  const outcome = await recordError(report, { dailyNewLimit: DAILY_NEW_ERRORS })
  // Without the secret key the function log is where it goes, as a server
  // error's does: where and what, never who.
  if (outcome === "off")
    console.error(
      JSON.stringify({
        event: "browser_error",
        route: normalizeRoute(report.route),
        name: report.name.slice(0, 200),
        message: normalizeMessage(report.message),
      })
    )
  return new NextResponse(null, { status: 204 })
}
