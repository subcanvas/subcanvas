import { BlankCanvas } from "@/components/whiteboard/blank-canvas"

// Shown while a document's page is fetched. It holds the header's shape so
// the page does not jump when the real one arrives, and the canvas is the
// same blank paper the whiteboard draws on.
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col bg-sheet" aria-busy="true" aria-label="Opening the document">
      <div className="flex items-center gap-3 border-b border-rule px-4 py-2">
        {/* One row, as the real header has on a wide screen; a narrow one
            puts the trail above the title. */}
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-5 w-40 animate-pulse rounded-md bg-muted md:hidden" />
          <div className="h-7 w-64 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <BlankCanvas className="flex-1" />
    </div>
  )
}
