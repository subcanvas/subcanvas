"use client"

import { useSyncExternalStore } from "react"

// A moment in the reader's own time zone, which the server does not know.
// The server writes it in UTC; the browser rewrites it once it has loaded.
export function LocalTime({ iso }: { iso: string }) {
  const local = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const date = new Date(iso)
  return (
    <time dateTime={iso} title={date.toISOString()}>
      {date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        ...(local ? {} : { timeZone: "UTC", timeZoneName: "short" }),
      })}
    </time>
  )
}
