"use client"

import Link from "next/link"
import { useSyncExternalStore } from "react"

import { DocumentBreadcrumb, type Crumb } from "@/components/document-breadcrumb"
import { DocumentTitle } from "@/components/editor/document-title"
import { TextDocument } from "@/components/editor/text-document"
import { useProjectAddresses } from "@/components/project-addresses"
import { WhiteboardDocument } from "@/components/whiteboard/whiteboard-document"
import { codeFromSegment } from "@/lib/navigation"
import { userColor } from "@/lib/user-color"
import { cn } from "@/lib/utils"

import { playgroundProject, usePlayground } from "./playground"

// The person in the playground, who has no account.
const VISITOR = { id: "visitor", name: "You", color: userColor("visitor") }

// One document of the playground, found by its address the way the app's
// document page finds one ([org]/[project]/[doc]/page.tsx), with the trail
// the visitor came by.
export function PlaygroundDocument({ path, via }: { path: string[]; via: string[] }) {
  const { index, example } = usePlayground()
  const project = playgroundProject(example)
  const addresses = useProjectAddresses()
  // Read again whenever a document is renamed, given an icon, or made.
  useSyncExternalStore(index.store.subscribe!, index.version, () => 0)

  const [, segment, permalinkId] = path
  const id =
    segment === "d" && permalinkId
      ? permalinkId
      : segment
        ? addresses.idForCode(codeFromSegment(segment) ?? "")
        : index.topDocumentId
  const document = id ? index.find(id) : null

  if (!document || document.deleted)
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-heading text-xl font-semibold">Nothing here</p>
        <p className="text-sm text-graphite">This page was deleted, or never was.</p>
        <Link href={example.home} className="text-sm text-cobalt underline underline-offset-4">
          Back to the example
        </Link>
      </main>
    )

  // The way the visitor came, or where the document lives.
  let trail: Crumb[]
  if (via.length)
    trail = via.flatMap((code) => {
      const entry = index.find(addresses.idForCode(code) ?? "")
      return entry ? [{ id: entry.id, title: entry.title, icon: entry.icon }] : []
    })
  else {
    trail = []
    for (let at = document.parentId && index.find(document.parentId); at; at = at.parentId && index.find(at.parentId))
      trail.unshift({ id: at.id, title: at.title, icon: at.icon })
  }
  const trailIds = trail.map((crumb) => crumb.id)

  const breadcrumb = (
    <DocumentBreadcrumb
      projectName={example.name}
      projectIcon={null}
      trail={trail}
      current={document.title}
      currentIcon={document.icon}
    />
  )
  const title = (compact: boolean) => (
    <DocumentTitle
      key={document.title}
      project={project}
      documentId={document.id}
      title={document.title}
      icon={document.icon}
      editable
      compact={compact}
    />
  )
  const context = { orgId: project.orgId, projectId: project.projectId, slug: project.slug, via: trailIds }

  if (document.type === "whiteboard")
    return (
      <main id="main" className={cn("flex min-h-0 flex-1 flex-col bg-sheet", trail.length > 0 && "animate-sheet-enter")}>
        <WhiteboardDocument
          key={document.id}
          documentId={document.id}
          editable
          context={{ ...context, whiteboardId: document.id }}
          user={VISITOR}
          repository={null}
          breadcrumb={breadcrumb}
          title={title(true)}
        />
      </main>
    )

  return (
    <main id="main" className={cn("flex flex-1 flex-col overflow-y-auto bg-sheet", trail.length > 0 && "animate-sheet-enter")}>
      <TextDocument
        key={document.id}
        documentId={document.id}
        editable
        user={VISITOR}
        context={context}
        page={{ breadcrumb, title: title(false) }}
      />
    </main>
  )
}
