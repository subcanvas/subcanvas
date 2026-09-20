import { isClutter } from "./paths"

// What a person picked or dropped, before any of it is read. Kept apart from
// the reading (collect.ts) because the project tree needs this at once, when
// something is dropped on it, and should not have to load the rest for that.

export type PickedFile = { path: string; file: Blob }

// A folder picker reports each file's path from the folder down.
export function pickedFromInput(files: Iterable<File>): PickedFile[] {
  return [...files].map((file) => ({ path: file.webkitRelativePath || file.name, file }))
}

// What was dropped, folders walked to their files. The entries must be
// taken from the event before anything is awaited: the browser empties the
// drop's data once the handler returns.
export async function pickedFromDrop(data: DataTransfer): Promise<PickedFile[]> {
  const entries: FileSystemEntry[] = []
  const loose: PickedFile[] = []
  for (const item of data.items) {
    if (item.kind !== "file") continue
    const entry = item.webkitGetAsEntry()
    if (entry) entries.push(entry)
    else {
      // No entry means no folders, but the file itself can still be had.
      const file = item.getAsFile()
      if (file) loose.push({ path: file.name, file })
    }
  }
  return [...loose, ...(await walk(entries))]
}

async function walk(entries: FileSystemEntry[]): Promise<PickedFile[]> {
  const picked: PickedFile[] = []
  for (const entry of entries) {
    if (isClutter(entry.name)) continue
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
      picked.push({ path: entry.fullPath.replace(/^\/+/, ""), file })
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      // A directory is read a page at a time, until a page comes back empty.
      for (;;) {
        const page = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
        if (!page.length) break
        picked.push(...(await walk(page)))
      }
    }
  }
  return picked
}
