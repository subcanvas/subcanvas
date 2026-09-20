// Images that an import's own files hold, as opposed to ones on the web.
//
// There is nowhere to put them yet: documents have no media storage. Every
// local image an imported note shows goes through `importLocalImage`, which
// for now always answers "skipped"; the note keeps the image's alt text,
// and the person is told how many were left behind. When storage exists,
// upload the import's images before it is planned, and answer here with
// where each one went.

export type LocalImage = { status: "skipped" } | { status: "imported"; url: string }

// `path` is the image's place in the import, or null when the note points
// outside of it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function importLocalImage(path: string | null): LocalImage {
  return { status: "skipped" }
}
