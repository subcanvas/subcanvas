import Link from "next/link"
import { Fragment } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { documentHref, type ProjectPath } from "@/lib/navigation"

export type Crumb = { id: string; title: string }

// The trail to the open document (R2.1). Each crumb links back along the
// same trail, so going up keeps the path the reader came by.
export function DocumentBreadcrumb({
  project,
  projectName,
  trail,
  current,
}: {
  project: ProjectPath
  projectName: string
  trail: Crumb[]
  current: string
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href={`/${project.slug}/${project.projectId}`} />}>
            {projectName}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {trail.map((crumb, index) => (
          <Fragment key={`${crumb.id}-${index}`}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink
                render={
                  <Link
                    href={documentHref(
                      project,
                      crumb.id,
                      trail.slice(0, index).map((c) => c.id)
                    )}
                  />
                }
                className="max-w-40 truncate"
              >
                {crumb.title}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="max-w-60 truncate">{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
