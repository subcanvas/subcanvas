import { expect } from "@playwright/test"

// Mailpit is where the local stack's mail goes (`supabase start` prints the
// address). Its API is documented at /api/v1, and these are the two calls a
// test needs: find the message sent to an address, and read the link in it.
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324"

type Summary = { ID: string; To: { Address: string }[] }

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`)
  if (!response.ok) throw new Error(`Mailpit ${path} answered ${response.status}`)
  return (await response.json()) as T
}

// The id of the newest message to this address, or null while none has
// arrived. The mailbox is shared with whatever else is running, so messages
// are matched by recipient and never deleted.
async function newestTo(address: string): Promise<string | null> {
  const { messages } = await api<{ messages: Summary[] }>("/api/v1/messages?limit=50")
  const found = messages.find((message) =>
    message.To.some((to) => to.Address.toLowerCase() === address.toLowerCase())
  )
  return found?.ID ?? null
}

// The sign-in link Supabase mailed, whatever email template this server
// uses: the one link that goes to the Auth API's verify endpoint.
export async function signInLinkFor(address: string): Promise<string> {
  await expect
    .poll(() => newestTo(address), { message: `no mail for ${address}`, timeout: 30_000 })
    .not.toBeNull()
  const id = await newestTo(address)

  const message = await api<{ HTML?: string; Text?: string }>(`/api/v1/message/${id}`)
  const body = `${message.Text ?? ""}\n${message.HTML ?? ""}`
  // HTML entities: the href in the markup writes & as &amp;.
  const match = body.replace(/&amp;/g, "&").match(/https?:\/\/\S*\/auth\/v1\/verify\?[^\s"'<>)]+/)
  if (!match) throw new Error(`No sign-in link in the message to ${address}`)
  return match[0]
}
