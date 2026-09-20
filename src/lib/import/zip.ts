import { Inflate } from "fflate"

import { MAX_ZIP_ENTRIES } from "./limits"

// Reads a zip without trusting it. The list of entries comes from the
// central directory at the end of the file, and an entry is unpacked only
// when asked for, straight from its slice of the file: a vault with a
// gigabyte of attachments is never held in memory, and the attachments are
// never unpacked at all. Every size a zip states about itself is a claim.
// What is unpacked is counted as it comes out, and stopped at the limit.

export class ZipError extends Error {}

export type ZipEntry = {
  // As written in the zip. Not yet safe to use as a path.
  name: string
  directory: boolean
  // What the zip claims the entry unpacks to.
  size: number
  compressedSize: number
  // Stored (0) and deflated (8) are what zip tools write.
  method: number
  encrypted: boolean
  offset: number
}

const END = 0x06054b50
const END_64 = 0x06064b50
const LOCATOR_64 = 0x07064b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
// The end record, plus the longest comment a zip can carry after it.
const END_SEARCH = 22 + 0xffff
// Far more than MAX_ZIP_ENTRIES entries with long names need.
const MAX_DIRECTORY_BYTES = 32_000_000
const NOT_A_ZIP = "This file is not a zip, or it is damaged."

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const read = async (blob: Blob, start: number, end: number) =>
  new Uint8Array(await blob.slice(start, end).arrayBuffer())
// Sizes past 2^53 do not occur in a file a browser can hold.
const u64 = (data: DataView, at: number) => Number(data.getBigUint64(at, true))

async function findDirectory(blob: Blob) {
  const tailStart = Math.max(0, blob.size - END_SEARCH)
  const tail = await read(blob, tailStart, blob.size)
  const data = view(tail)
  let at = tail.length - 22
  while (at >= 0 && data.getUint32(at, true) !== END) at--
  if (at < 0) throw new ZipError(NOT_A_ZIP)

  let count = data.getUint16(at + 10, true)
  let size = data.getUint32(at + 12, true)
  let offset = data.getUint32(at + 16, true)
  // A zip past 4 GB or 65,535 entries keeps the real numbers in a second record.
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    if (at < 20 || data.getUint32(at - 20, true) !== LOCATOR_64) throw new ZipError(NOT_A_ZIP)
    const record = view(await read(blob, u64(data, at - 12), u64(data, at - 12) + 56))
    if (record.byteLength < 56 || record.getUint32(0, true) !== END_64) throw new ZipError(NOT_A_ZIP)
    count = u64(record, 32)
    size = u64(record, 40)
    offset = u64(record, 48)
  }
  return { count, size, offset }
}

export async function listZip(blob: Blob): Promise<ZipEntry[]> {
  const directory = await findDirectory(blob)
  if (directory.count > MAX_ZIP_ENTRIES || directory.size > MAX_DIRECTORY_BYTES)
    throw new ZipError(
      `This zip holds more than ${MAX_ZIP_ENTRIES.toLocaleString("en")} files, which is more than one import takes. Unzip it and import a folder at a time.`
    )
  if (directory.offset + directory.size > blob.size) throw new ZipError(NOT_A_ZIP)

  const bytes = await read(blob, directory.offset, directory.offset + directory.size)
  const data = view(bytes)
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let at = 0
  while (at + 46 <= bytes.length && data.getUint32(at, true) === CENTRAL) {
    const nameLength = data.getUint16(at + 28, true)
    const extraLength = data.getUint16(at + 30, true)
    const commentLength = data.getUint16(at + 32, true)
    let compressedSize = data.getUint32(at + 20, true)
    let size = data.getUint32(at + 24, true)
    let offset = data.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))

    // The 64-bit values, for whichever of the three did not fit.
    let extra = at + 46 + nameLength
    const extraEnd = Math.min(extra + extraLength, bytes.length)
    while (extra + 4 <= extraEnd) {
      const id = data.getUint16(extra, true)
      const length = data.getUint16(extra + 2, true)
      if (id === 1) {
        let field = extra + 4
        const next = () => {
          const value = field + 8 <= extraEnd ? u64(data, field) : 0
          field += 8
          return value
        }
        if (size === 0xffffffff) size = next()
        if (compressedSize === 0xffffffff) compressedSize = next()
        if (offset === 0xffffffff) offset = next()
      }
      extra += 4 + length
    }

    entries.push({
      name,
      directory: name.endsWith("/"),
      size,
      compressedSize,
      method: data.getUint16(at + 10, true),
      encrypted: (data.getUint16(at + 8, true) & 1) === 1,
      offset,
    })
    if (entries.length > MAX_ZIP_ENTRIES) throw new ZipError(NOT_A_ZIP)
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

const CHUNK = 32_768

// One entry, unpacked. Null when it turns out larger than `maxBytes`,
// whatever size it claimed, or cannot be unpacked.
export async function readZipEntry(blob: Blob, entry: ZipEntry, maxBytes: number): Promise<Uint8Array | null> {
  if (entry.encrypted || (entry.method !== 0 && entry.method !== 8)) return null
  // Deflate adds a few bytes to what it cannot shrink, never more.
  if (entry.size > maxBytes || entry.compressedSize > maxBytes + 1024) return null

  const header = view(await read(blob, entry.offset, entry.offset + 30))
  if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL) return null
  const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
  if (start + entry.compressedSize > blob.size) return null
  const packed = await read(blob, start, start + entry.compressedSize)
  if (entry.method === 0) return packed

  const pieces: Uint8Array[] = []
  let total = 0
  const inflate = new Inflate((piece) => {
    total += piece.length
    if (total <= maxBytes) pieces.push(piece)
  })
  try {
    // A little at a time, so a bomb is noticed after a few megabytes of it.
    for (let at = 0; at < packed.length && total <= maxBytes; at += CHUNK)
      inflate.push(packed.subarray(at, at + CHUNK), at + CHUNK >= packed.length)
  } catch {
    return null
  }
  if (total > maxBytes) return null

  const whole = new Uint8Array(total)
  let at = 0
  for (const piece of pieces) {
    whole.set(piece, at)
    at += piece.length
  }
  return whole
}
