import "server-only"

import { lookup as dnsLookup, type LookupAddress } from "node:dns"
import { request as httpRequest, type IncomingMessage } from "node:http"
import { request as httpsRequest } from "node:https"
import type { LookupFunction } from "node:net"

import { isPublicAddress } from "./address"

// A GET to an address on the open internet, for a link preview: http or https
// only, a public address only (address.ts), checked when the connection is
// made and again for every redirect, a few redirects at most, a short time to
// answer, and a cap on what is read. Nothing is sent but a plain request: no
// cookies, no credentials.

// `truncated` when there was more than `maxBytes`: enough of a page for its
// <head>, but a file that big is no file this wants.
export type Fetched = { url: string; contentType: string; body: Buffer; truncated: boolean }

const MAX_REDIRECTS = 4
const TIMEOUT_MS = 6000
const USER_AGENT = "Mozilla/5.0 (compatible; SubcanvasLinkPreview/1.0; +https://subcanvas.app)"

export class LinkFetchError extends Error {}

// Resolves a name and refuses it unless every address it has is public, so
// the one the socket connects to is public too.
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0)
    const list = addresses as LookupAddress[]
    if (!list.length || !list.every((entry) => isPublicAddress(entry.address)))
      return callback(new LinkFetchError("That address is not on the open internet."), "", 0)
    if (options.all) return (callback as unknown as (error: null, addresses: LookupAddress[]) => void)(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

function once(
  url: URL,
  accept: string,
  maxBytes: number
): Promise<{ response: IncomingMessage; body?: Buffer; truncated?: boolean }> {
  return new Promise((resolve, reject) => {
    // A literal address skips the lookup, so it is checked here.
    const literal = url.hostname.replace(/^\[|\]$/g, "")
    if (/^[\d.]+$|:/.test(literal) && !isPublicAddress(literal))
      return reject(new LinkFetchError("That address is not on the open internet."))

    const send = url.protocol === "https:" ? httpsRequest : httpRequest
    const request = send(
      url,
      {
        method: "GET",
        lookup: publicLookup,
        timeout: TIMEOUT_MS,
        headers: { "user-agent": USER_AGENT, accept, "accept-language": "en" },
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          response.resume()
          return resolve({ response })
        }
        const chunks: Buffer[] = []
        let size = 0
        response.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) {
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)))
            response.destroy()
            return resolve({ response, body: Buffer.concat(chunks), truncated: true })
          }
          chunks.push(chunk)
        })
        response.on("end", () => resolve({ response, body: Buffer.concat(chunks) }))
        response.on("error", reject)
      }
    )
    request.on("timeout", () => request.destroy(new LinkFetchError("The page took too long to answer.")))
    request.on("error", reject)
    request.end()
  })
}

export async function fetchPublic(address: string, { accept, maxBytes }: { accept: string; maxBytes: number }): Promise<Fetched> {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    throw new LinkFetchError("That is not a web address.")
  }
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new LinkFetchError("Only web addresses can be previewed.")
    if (url.username || url.password) throw new LinkFetchError("An address with a password in it is not previewed.")
    const { response, body, truncated } = await once(url, accept, maxBytes)
    const status = response.statusCode ?? 0
    if (status >= 300 && status < 400) {
      const next = response.headers.location
      if (!next) throw new LinkFetchError("The page sent nowhere.")
      url = new URL(next, url)
      continue
    }
    if (status < 200 || status >= 300) throw new LinkFetchError(`The page answered ${status}.`)
    return {
      url: url.href,
      contentType: String(response.headers["content-type"] ?? ""),
      body: body ?? Buffer.alloc(0),
      truncated: truncated ?? false,
    }
  }
  throw new LinkFetchError("The page redirected too many times.")
}
