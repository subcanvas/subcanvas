// Headers for a file the browser saves instead of showing: the name it is
// saved under, in plain ASCII for old clients and in full (RFC 6266,
// RFC 5987) for the rest.
export function attachment(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

// A download is for the person who asked, as they could read it then.
export const PRIVATE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }

export const notFound = () =>
  new Response("Not found", { status: 404, headers: { ...PRIVATE, "Content-Type": "text/plain; charset=utf-8" } })
