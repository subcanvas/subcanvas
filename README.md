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

## Billing

Billing is off by default, and a self-hosted server needs none of it: with no Stripe variables set there is no document limit, no Billing page in the navigation, and the Stripe code never runs.

A deployment that sells subscriptions turns on two things:

1. **The free tier.** `update private.config set free_document_limit = 25;` Free orgs can then hold 25 documents (node descriptions and trashed documents do not count); a paid org has no limit. The limit is enforced in the database.
2. **Stripe.** Set the Stripe variables in `.env.example`, using a recurring $5 per-seat price. In production, point a Stripe webhook at `/api/stripe/webhook` with the `customer.subscription.*` and `checkout.session.completed` events. Locally, run `stripe listen --forward-to localhost:3000/api/stripe/webhook` instead.

## License

Copyright (C) 2026 Trevin Lee

Graph Notes is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, version 3.

In short: you may self-host and modify it, but if you run a modified version as a network service, you must make your modified source available to its users. It comes with no warranty.
