// How much one import may bring in. The browser applies these while it reads
// files, and the server applies the ones about size again to what it is
// sent, since a request need not come from the dialog.

// A note longer than this is a data dump, and the editor would crawl on it.
export const MAX_FILE_BYTES = 500_000
// All text of one import together, as read into the browser's memory.
export const MAX_TOTAL_BYTES = 50_000_000
export const MAX_DOCUMENTS = 2_000

// A zip with more entries is refused outright, before anything is unpacked.
// Its attachments may be of any size: they are never unpacked.
export const MAX_ZIP_ENTRIES = 5_000
// Notion splits a large export into zips inside one zip. An inner zip has
// to be unpacked into memory to be read, so it has a limit of its own.
export const MAX_INNER_ZIP_BYTES = 200_000_000

// A table larger than this is a database, not a page.
export const MAX_CSV_ROWS = 200
export const MAX_CSV_COLUMNS = 20

// One request to the server. A server action's body is capped at 1 MB by
// default, and each document is converted on the server inside that one
// request, so both the bytes and the count are kept modest.
export const MAX_BATCH_DOCUMENTS = 25
export const MAX_BATCH_BYTES = 600_000
