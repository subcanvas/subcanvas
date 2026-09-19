// Shown while a document's page is fetched. It holds the header's shape so
// the page does not jump when the real one arrives.
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col bg-sheet" aria-busy="true" aria-label="Opening the document">
      <div className="flex items-center gap-3 border-b border-rule px-4 py-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-6 w-64 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div
        className="flex-1 bg-paper"
        style={{
          backgroundImage: "radial-gradient(var(--blueline) 1.5px, transparent 1.5px)",
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  )
}
