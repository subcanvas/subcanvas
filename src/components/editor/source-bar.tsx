import { ArrowUpRight, FolderGit2 } from "lucide-react"

import { sourceEditUrl, sourceViewUrl, type DocumentSource } from "@/lib/github/source"

// Above a document that was imported from a repository: where it came from,
// and where to change it. The repository owns the text, so it is read-only
// here (docs/ROADMAP.md, section 3).
export function SourceBar({ source }: { source: DocumentSource }) {
  return (
    <div className="mx-13 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-rule bg-paper px-3 py-2 text-xs text-graphite">
      <FolderGit2 className="size-3.5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 break-words">
        From{" "}
        <a
          href={sourceViewUrl(source)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-ink underline-offset-2 outline-none hover:underline focus-visible:underline"
        >
          {source.repository}
        </a>
        {" · "}
        <span className="font-mono break-all text-ink">{source.path}</span>
      </p>
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
