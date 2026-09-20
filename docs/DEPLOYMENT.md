# Running your own Subcanvas

Subcanvas needs two things: a [Supabase](https://supabase.com) project (database, sign-in, real-time sync, storage) and somewhere to run the Next.js app. The app keeps no state of its own, so any host that runs Node 22 works.

A self-hosted server has no plan limits and no billing. Nothing needs switching off.

Plan on about half an hour. You need a Supabase account, a host, and a domain.

## 1. Create the Supabase project

Create a project at supabase.com and keep the database password you choose. Note the **project ref**: the id in the dashboard URL, `supabase.com/dashboard/project/<ref>`.

## 2. Create the database schema

From a copy of this repository, with the [Supabase CLI](https://supabase.com/docs/guides/local-development) installed:

```sh
supabase login
supabase link --project-ref <ref>      # asks for the database password
supabase db push --dry-run             # lists the migrations, changes nothing
supabase db push
```

## 3. Configure sign-in

In the Supabase dashboard, under **Authentication**:

| Setting | Value |
|---|---|
| URL Configuration → Site URL | `https://your-domain` |
| URL Configuration → Redirect URLs | `https://your-domain/**` |
| Sign In / Providers → Email | On (the default). Subcanvas signs people in with emailed links; there are no passwords. |

**Set up email before inviting anyone.** Supabase's built-in mailer sends only a few emails an hour, which is enough to try things and not enough for a team. Under Authentication → Emails → SMTP Settings, add an SMTP provider (Resend, Postmark, Amazon SES), and add the DNS records that provider asks for to your domain.

**Google or GitHub sign-in (optional).** Create an OAuth app with each provider, using `https://<ref>.supabase.co/auth/v1/callback` as its redirect URI. Enable the provider under Sign In / Providers with the app's client id and secret, then list it in `NEXT_PUBLIC_AUTH_PROVIDERS` below.

## 4. Run the app

Give your host these environment variables (they are also listed in [`.env.example`](../.env.example)). The keys are under Project Settings → API Keys.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key. Safe to expose: row-level security is what protects the data. |
| `SUPABASE_SECRET_KEY` | A secret key. Server only. It bypasses row-level security, so never give it to a build that runs untrusted code, such as a preview deployment of someone's pull request. Only billing uses it; without billing you can leave it out. |
| `OAUTH_CLIENT_ID_GITHUB`, `OAUTH_CLIENT_SECRET_GITHUB` | Optional, both or neither. Server only. The id and secret of a GitHub OAuth app, the one behind "Continue with GitHub" or any other. Import from GitHub uses them to read public repositories at 5,000 requests an hour; without them GitHub allows this server 60 an hour, about 20 imports. They read nothing a stranger could not, and there is no token to create or rotate. |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | Optional: `google`, `github`, or `google,github` |
| `LEGAL_OPERATOR`, `LEGAL_CONTACT`, `LEGAL_GOVERNING_LAW` | Optional, all three or none: the person or company running the server, the address for legal and privacy requests, and the US state whose law governs (for example `California`). When set, the server has a Terms of Service at `/terms` and a Privacy Policy at `/privacy`, linked from the landing page and the sign-in card. The text describes subcanvas.app's setup (Supabase, Vercel, Resend, Stripe, Cloudflare; no analytics), so read both pages and change what does not match yours before publishing them under your name. Google requires both links on its OAuth consent screen. |

**On Vercel:** import your copy of the repository, add the variables (the secret key to the Production environment only), and add your domain.

**On any other Node host:**

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start          # serves on port 3000
```

**With Docker:**

```sh
docker build -t subcanvas \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
  --build-arg NEXT_PUBLIC_AUTH_PROVIDERS=google,github \
  .
docker run -p 3000:3000 --env-file subcanvas.env subcanvas
```

The `NEXT_PUBLIC_` values are compiled into the browser bundle, which is why they are build arguments: changing one means rebuilding the image. Everything else in the table (the `LEGAL_` variables, `SUPABASE_SECRET_KEY`, the Stripe keys) is read when the container runs, so it goes in the env file, and secrets never end up in an image layer. The container listens on port 3000 as a non-root user and keeps no state: all data is in Supabase, so it can be replaced or run in several copies freely. Put it behind something that terminates TLS.

Point your domain at the host, open it, sign in, and create your org.

## 5. Keeping it up to date

Pull the new version, rebuild the app, and run `supabase db push` again. Migrations are written so that the previous version of the app keeps working while the new one rolls out.

To have GitHub push migrations whenever your `main` changes, use [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). Create a `production` environment in your repository (Settings → Environments), restrict it to the `main` branch, add yourself as a required reviewer, and give it:

| Kind | Name | Value |
|---|---|---|
| Environment secret | `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access tokens |
| Environment secret | `SUPABASE_DB_PASSWORD` | From step 1 |
| Repository variable | `SUPABASE_PROJECT_REF` | From step 1 |
| Repository variable | `DEPLOY_ENABLED` | `true`. Set it last: until then the migration job is skipped. |

Environment secrets, unlike repository secrets, are released only to approved runs on the allowed branch, so a workflow pushed to some other branch cannot read them.

## Things to know

- **Anyone who finds your server can sign up** and create their own org. They cannot see yours: every org's data is isolated by row-level security. Restricting who may sign up is not built yet.
- **Invites are links.** An admin creates an invite and sends the link themselves; the app does not email it.
- **Your providers' limits are yours to check.** Supabase's free plan pauses a project after a week without activity, and caps real-time connections and messages. Vercel's Hobby plan does not allow commercial use.
- **Back up the database.** Supabase's paid plans take daily backups. On any plan, `supabase db dump` writes a copy you can keep.
- **Public projects.** An admin can make a project readable by anyone with the link. Reports and takedowns are described in the [README](../README.md#public-projects-and-moderation); they are SQL for now.
- **There is no published Docker image.** The repository has a `Dockerfile` (section 4), and the image has to be built with your own Supabase URL and key, so a public one would be of little use.

## Selling subscriptions (optional)

This is how subcanvas.app is run. Skip it unless you want a paid plan on your own server.

1. In Stripe, create a product with a recurring price of $5 a month, billed per unit (one unit is one editor).
2. Add a webhook endpoint at `https://your-domain/api/stripe/webhook` for these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Give the app `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (the endpoint's signing secret), and `SUPABASE_SECRET_KEY`. Start with Stripe's test mode.
4. Turn on the free plan's limits. Until you do, every org has the paid plan's allowances for free:
   ```sql
   update private.config set free_private_document_limit = 100, free_editor_limit = 3;
   ```
   The deploy workflow can keep these set for you: add the repository variables `FREE_PRIVATE_DOCUMENT_LIMIT` and `FREE_EDITOR_LIMIT` (a number, or `none`).
