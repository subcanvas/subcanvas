import { expect } from "@playwright/test"

// Mailpit is where the local stack's mail goes (`supabase start` prints the
// address): Supabase Auth's, and the app's own, which it sends to Mailpit's
// SMTP port when SMTP_HOST points there (.env.example). Its API is
// documented at /api/v1, and these are the calls a test needs: find the
// messages sent to an address, and read what is in one.
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324"

type Address = { Name: string; Address: string }
type Summary = { ID: string; To: Address[]; Subject: string }
export type Message = { Subject: string; Text: string; HTML: string; To: Address[]; ReplyTo: Address[] }

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

// Every message to this address, newest first. The mailbox is shared with
// whatever else is running, and every spec uses addresses of its own.
async function messagesTo(address: string): Promise<Summary[]> {
  const query = encodeURIComponent(`to:"${address}"`)
  const { messages } = await api<{ messages: Summary[] }>(`/api/v1/search?query=${query}&limit=50`)
  return messages.filter((message) =>
    message.To.some((to) => to.Address.toLowerCase() === address.toLowerCase())
  )
}

// Waits for the `count`th message to this address (the first by default)
// and returns the newest.
export async function mailTo(address: string, count = 1): Promise<Message> {
  await expect
    .poll(async () => (await messagesTo(address)).length, {
      message: `fewer than ${count} messages for ${address}`,
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(count)
  const [newest] = await messagesTo(address)
  return api<Message>(`/api/v1/message/${newest.ID}`)
}

// Waits for the message with this subject, to anyone: for mail to an
// address many specs share, such as the operator's.
export async function mailWithSubject(subject: string): Promise<Message> {
  const query = encodeURIComponent(`subject:"${subject}"`)
  const find = async () => {
    const { messages } = await api<{ messages: Summary[] }>(`/api/v1/search?query=${query}&limit=50`)
    return messages.find((message) => message.Subject === subject) ?? null
  }
  await expect.poll(find, { message: `no mail titled ${subject}`, timeout: 30_000 }).not.toBeNull()
  const found = await find()
  return api<Message>(`/api/v1/message/${found!.ID}`)
}

// The invite link in an invite email: /invite/ and the invite's token.
export function inviteLinkIn(message: Message): string {
  const match = message.Text.match(/https?:\/\/\S+\/invite\/[0-9a-f-]{36}/)
  if (!match) throw new Error(`No invite link in "${message.Subject}"`)
  return match[0]
}
