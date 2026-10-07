import { readFileSync } from "node:fs"
import path from "node:path"

// How the server under test is set up, for specs whose pages depend on it
// (billing, sign-in providers). A variable is read from the environment, or
// from .env.local when the environment does not set it, which is where
// `next start` and `next build` read it from too; set to nothing, it stays
// unset, as it does for Next.

const ROOT = path.resolve(__dirname, "../..")

// The variables `next start` loads, for a run started from a plain shell.
function dotEnvLocal(): Record<string, string> {
  let text: string
  try {
    text = readFileSync(path.join(ROOT, ".env.local"), "utf8")
  } catch {
    return {}
  }
  const values: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2")
  }
  return values
}

const fromFile = dotEnvLocal()

export const setting = (name: string) => process.env[name] ?? fromFile[name] ?? ""

// The sign-in buttons the server shows, in its order.
export const authProviders = setting("NEXT_PUBLIC_AUTH_PROVIDERS")
  .split(",")
  .map((provider) => provider.trim())
  .filter((provider) => provider === "google" || provider === "github")
