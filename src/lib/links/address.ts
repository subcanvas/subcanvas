import { isIP } from "node:net"

// Whether an address belongs to the open internet. A link preview is fetched
// by this server, from wherever someone pastes, so an address on its own
// network (the cloud's metadata service, a database, localhost) must never be
// reached that way. Checked on the address the name resolves to, at the
// moment of connecting (fetch.ts), so a name cannot point elsewhere between
// the check and the request.

const V4_PRIVATE: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, where cloud metadata lives
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and broadcast
]

const v4Number = (address: string) =>
  address.split(".").reduce((total, part) => total * 256 + Number(part), 0)

function v4IsPublic(address: string) {
  const value = v4Number(address)
  return !V4_PRIVATE.some(([base, bits]) => {
    const size = 2 ** (32 - bits)
    const start = v4Number(base)
    return value >= start && value < start + size
  })
}

// The eight 16-bit groups of an IPv6 address, with "::" expanded and an
// IPv4 tail ("::ffff:10.0.0.1") turned into two groups.
function v6Groups(address: string) {
  let text = address.toLowerCase().split("%")[0]
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (tail) {
    const value = v4Number(tail[1])
    text = text.slice(0, -tail[1].length) + `${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`
  }
  const [head, rest] = text.split("::")
  const left = head ? head.split(":") : []
  const right = rest !== undefined && rest ? rest.split(":") : []
  const missing = 8 - left.length - right.length
  return [...left, ...Array(rest !== undefined ? missing : 0).fill("0"), ...right].map((group) => parseInt(group || "0", 16))
}

function v6IsPublic(address: string) {
  const groups = v6Groups(address)
  if (groups.length !== 8 || groups.some((group) => Number.isNaN(group))) return false
  const [first] = groups
  // An IPv4 address written as IPv6 is judged as IPv4.
  if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    const v4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`
    return groups[5] === 0xffff ? v4IsPublic(v4) : false
  }
  if (groups.every((group) => group === 0)) return false // ::
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false // ::1
  if ((first & 0xfe00) === 0xfc00) return false // unique local, fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false // link-local, fe80::/10
  if ((first & 0xff00) === 0xff00) return false // multicast
  if (first === 0x2001 && groups[1] === 0x0db8) return false // documentation
  if (first === 0x64 && groups[1] === 0xff9b) return false // NAT64, which reaches IPv4 addresses
  return true
}

export function isPublicAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return v4IsPublic(address)
  if (family === 6) return v6IsPublic(address)
  return false
}
