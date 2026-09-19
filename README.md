# Graph Notes

An open-source Notion/Excalidraw hybrid. Build whiteboards and text documents that nest inside each other: click a node on an architecture diagram to open that service's own diagram, or click an edge to read the protocol between two services.

Status: early development. See [REQUIREMENTS.md](REQUIREMENTS.md) for what is being built and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model and build order.

## Stack

Next.js · Supabase (Auth, Postgres, Realtime, Storage) · React Flow · BlockNote · Yjs · shadcn/ui · Stripe

## Development

Requires Node 22+, pnpm, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```sh
pnpm install
supabase start              # local Supabase stack; prints the API URL and keys
cp .env.example .env.local  # then paste in the publishable key
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm dev` | Start the app at http://localhost:3000 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm build` | Production build |
| `pnpm db:test` | Database tests (pgTAP), including row-level security |
| `pnpm db:types` | Regenerate `src/lib/supabase/database.types.ts` after a migration |
| `supabase db reset` | Rebuild the local database from `supabase/migrations` |

Sign-in uses email magic links. Locally, emails are caught by Mailpit at http://127.0.0.1:54324 instead of being sent. Google and GitHub sign-in are off by default; see the notes at the bottom of `supabase/config.toml`.

After changing `supabase/config.toml`, restart the stack with `supabase stop && supabase start`.

## License

[AGPL-3.0](LICENSE)
