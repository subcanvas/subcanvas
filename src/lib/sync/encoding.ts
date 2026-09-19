// Postgres bytea travels through PostgREST as a "\x"-prefixed hex string.
export function toBytea(bytes: Uint8Array) {
  let hex = "\\x"
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0")
  return hex
}

export function fromBytea(value: string) {
  const hex = value.startsWith("\\x") ? value.slice(2) : value
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

// Realtime payloads are JSON, so binary updates go over the wire as base64.
export function toBase64(bytes: Uint8Array) {
  let binary = ""
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step)
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(binary)
}

export function fromBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
