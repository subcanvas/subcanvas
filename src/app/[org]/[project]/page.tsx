export default function ProjectPage() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <p className="font-heading text-xl font-semibold">Pick a sheet</p>
        <p className="text-sm leading-relaxed text-graphite">
          Choose a document on the left, or use + to add a whiteboard or a page of notes.
        </p>
      </div>
    </main>
  )
}
