# Subcanvas

An open-source Notion/Excalidraw hybrid. Build whiteboards and text documents that nest inside each other: click a node on an architecture diagram to open that service's own diagram, or click an edge to read the protocol between two services.

Status: early development. See [REQUIREMENTS.md](REQUIREMENTS.md) for what is being built and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model and build order. What comes after v1 is in [docs/ROADMAP.md](docs/ROADMAP.md). To run your own, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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

Sign-in is by email and password or by an emailed link. Locally, emails are caught by Mailpit at http://127.0.0.1:54324 instead of being sent. Google and GitHub sign-in are off by default; see the notes at the bottom of `supabase/config.toml`.

After changing `supabase/config.toml`, restart the stack with `supabase stop && supabase start`.

## Public projects and moderation

An admin can make a project public: anyone with the link (`/p/<project id>`) can then read every document in it, and nobody outside the org can edit. Public pages are not indexed by search engines, and each carries a Report button.

Reports land in the `abuse_reports` table, readable only by the operator (the Supabase dashboard or SQL). To take a project offline, whatever its org sets:

```sql
update public.projects set taken_down_at = now() where id = '<project id>';
```

## Plans and billing

Billing is off by default, and a self-hosted server needs none of it: with nothing configured there are no limits, no Billing page, and the Stripe code never runs.

A deployment that sells subscriptions turns on two things:

1. **The free plan's limits**, enforced in the database:
   ```sql
   update private.config set free_private_document_limit = 100, free_editor_limit = 3;
   ```
   Free orgs then get unlimited documents in public projects, 100 documents across private projects (node descriptions and trashed documents do not count), and 3 editors. Viewers are always unlimited and free. A paid org has no limits.
2. **Stripe.** Set the Stripe variables in `.env.example`, using a recurring $5 per-editor price. In production, point a Stripe webhook at `/api/stripe/webhook` with the `customer.subscription.*` and `checkout.session.completed` events. Locally, run `stripe listen --forward-to localhost:3000/api/stripe/webhook` instead.

## License

Copyright (C) 2026 Trevin Lee

Subcanvas is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, version 3.

In short: you may self-host and modify it, but if you run a modified version as a network service, you must make your modified source available to its users. It comes with no warranty.
