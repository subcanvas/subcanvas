import { formatBytes } from "@/lib/whiteboard/media"

// How much of the org's storage for pictures and videos is in use. Drawn in
// ink, not cobalt, because it is something to read and not to press, and
// never red: being full destroys nothing, it only stops new files.
export function StorageMeter({ used, limit }: { used: number; limit: number }) {
  const full = used >= limit
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <p>
          <span className="font-medium tabular-nums">{formatBytes(used)}</span>
          <span className="text-graphite"> of {formatBytes(limit)} used</span>
        </p>
        <p className="text-graphite tabular-nums">{full ? "Full" : `${percent}%`}</p>
      </div>
      <div
        role="meter"
        aria-label="Storage for pictures and videos"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={`${formatBytes(used)} of ${formatBytes(limit)}`}
        className="h-2 overflow-hidden rounded-full border border-rule bg-muted"
      >
        {/* A sliver stays visible for any use at all, so "some" never reads as "none". */}
        <div
          className="h-full rounded-full bg-ink"
          style={{ width: used > 0 ? `max(${percent}%, 0.375rem)` : 0 }}
        />
      </div>
      <p className="max-w-xl text-sm leading-relaxed text-graphite">
        {full
          ? "New pictures and videos are refused until there is room. "
          : "Pictures and videos on every whiteboard in this org count toward it. "}
        A file counts until the whiteboard it is on is deleted from the trash.
      </p>
    </div>
  )
}
