import { ArrowUpRight, FolderGit2 } from "lucide-react"

import { sourceEditUrl, sourceViewUrl, type DocumentSource } from "@/lib/github/source"

// Above a document that was imported from a repository: where it came from,
// and where to change it. The repository owns the text, so it is read-only
// here (docs/ROADMAP.md, section 3).
export function SourceBar({ source }: { source: DocumentSource }) {
  return (
    <div className="mx-13 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-rule bg-paper px-3 py-2 text-xs text-graphite">
      {/* One line where there is room. In the side panel the path drops under
          the repository, and the link under both. */}
      <div className="flex min-w-0 flex-1 basis-60 items-start gap-2">
        <FolderGit2 className="mt-px size-3.5 shrink-0" aria-hidden />
        <p className="flex min-w-0 flex-wrap gap-x-1.5 leading-relaxed">
          <span className="min-w-0">
            From{" "}
            <a
              href={sourceViewUrl(source)}
              target="_blank"
              rel="noreferrer"
              className="font-mono break-all text-ink underline-offset-2 outline-none hover:underline focus-visible:underline"
            >
              {source.repository}
            </a>
          </span>
          <span className="min-w-0 font-mono break-all text-ink">
            <span className="font-sans text-graphite">· </span>
            {source.path}
          </span>
        </p>
      </div>
      <a
        href={sourceEditUrl(source)}
        target="_blank"
        rel="noreferrer"
        className="flex shrink-0 items-center gap-0.5 font-medium text-cobalt underline-offset-2 outline-none hover:underline focus-visible:underline"
      >
        Edit on GitHub
        <ArrowUpRight className="size-3" aria-hidden />
      </a>
    </div>
  )
}
