"use client"

import { useParams, usePathname } from "next/navigation"
import { useEffect } from "react"

import { routePattern } from "@/lib/errors/normalize"
import { reportError, setReportRoute } from "@/lib/errors/report"

// Sends what goes wrong in the browser and nothing catches to this site's
// own error reports (lib/errors/report.ts). In the root layout, once.
export function ErrorReporter() {
  const pathname = usePathname()
  const params = useParams()

  useEffect(() => {
    setReportRoute(routePattern(pathname, params ?? {}))
  }, [pathname, params])

  useEffect(() => {
    const onError = (event: ErrorEvent) => reportError(event.error ?? event.message)
    const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason)
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return null
}
