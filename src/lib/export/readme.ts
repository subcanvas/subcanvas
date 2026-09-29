import { MANIFEST_FILE, type ExportLayout } from "./layout"

// The two files at the top of a project's export: README.txt for a person,
// and subcanvas-export.json for a program, which is also how Import files
// knows a zip is one of these (lib/import/collect.ts).

export type LeftOut = { path: string; reason: string }

export const EXPORT_FORMAT = "subcanvas-export"
const FORMAT_DOCS = "https://github.com/subcanvas/subcanvas/blob/main/docs/EXPORTING.md"

type About = {
  project: { id: string; name: string }
  layout: ExportLayout
  origin: string
  exportedAt: Date
  leftOut: LeftOut[]
}

const when = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`

export function readmeText({ project, origin, exportedAt, leftOut }: About) {
  const host = new URL(origin).host
  const lines = [
    project.name,
    "",
    `Exported from ${host} on ${when(exportedAt)}: everything in the project`,
    "that the person exporting it could read, apart from the trash.",
    "",
    "What is where",
    "",
    "  Folders are the project's folders.",
    "  Name.md    A page, as Markdown. It opens with its title.",
    "  Name.svg   A whiteboard, as a picture.",
    "  Name.json  The same whiteboard's contents: every box, arrow and group,",
    "             and what each one holds.",
    "  Name/      What a page or a whiteboard holds: the pages and whiteboards",
    "             inside it, the documents its boxes hold (a box's description",
    "             is a page there), and the pictures and videos it shows.",
    "",
    "Links between documents in this zip point at their files. Anything else",
    `points at its address on ${host}. ${MANIFEST_FILE} lists every folder`,
    "and document with its id. Both JSON formats are described at",
    FORMAT_DOCS,
    "",
    "Bringing it back",
    "",
    "In a Subcanvas project, choose Import files and pick this zip. Pages come",
    "back with their pictures, videos and links. Whiteboards do not; the",
    "documents their boxes held come back in a folder named after the",
    "whiteboard.",
  ]
  if (leftOut.length)
    lines.push("", "Left out", "", ...leftOut.map(({ path, reason }) => `  ${path}: ${reason}`))
  return `${lines.join("\n")}\n`
}

export function manifestJson({ project, layout, origin, exportedAt, leftOut }: About) {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: 1,
      exported_at: exportedAt.toISOString(),
      from: origin,
      project,
      folders: layout.folders,
      documents: layout.documents,
      left_out: leftOut,
    },
    null,
    2
  )
}
