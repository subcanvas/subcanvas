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

The migrations also create the two private Storage buckets that hold the pictures and videos people put on whiteboards (`media-images`, 10 MB a file; `media-videos`, 100 MB a file) and the policies that guard them. There is nothing to create by hand, but check one setting: under **Storage → Settings**, the project's **global file size limit** must be at least 100 MB, or videos larger than it are refused whatever the bucket allows. Supabase's free plan caps that limit at 50 MB, so on it a video can be 50 MB at most; the app reports the refusal and nothing else breaks. To allow less, lower the buckets' `file_size_limit` and the numbers at the top of `src/lib/whiteboard/media.ts` together.

Files go from the browser straight to Supabase Storage and are played from it, so the host of the Next.js app sees none of that traffic and its request size limits (4.5 MB on Vercel) do not apply. If the app is served with a `Content-Security-Policy`, allow the Supabase project's address in `img-src`, `media-src` and `connect-src`.

## 3. Configure sign-in

In the Supabase dashboard, under **Authentication**:

| Setting | Value |
|---|---|
| URL Configuration → Site URL | `https://your-domain` |
| URL Configuration → Redirect URLs | `https://your-domain/**` |
| Sign In / Providers → Email | On (the default). Subcanvas signs people in with emailed links; there are no passwords. |

**Set up email before inviting anyone.** Supabase's built-in mailer sends only a few emails an hour, which is enough to try things and not enough for a team. Under Authentication → Emails → SMTP Settings, add an SMTP provider (Resend, Postmark, Amazon SES), and add the DNS records that provider asks for to your domain.

**Agents (optional).** To let people connect Claude, Cursor, and other MCP clients, turn on Supabase's OAuth server as described in [MCP.md](MCP.md#turning-it-on).

**Google or GitHub sign-in (optional).** Create an OAuth app with each provider, using `https://<ref>.supabase.co/auth/v1/callback` as its redirect URI. Enable the provider under Sign In / Providers with the app's client id and secret, then list it in `NEXT_PUBLIC_AUTH_PROVIDERS` below.

## 4. Run the app

Give your host these environment variables (they are also listed in [`.env.example`](../.env.example)). The keys are under Project Settings → API Keys.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key. Safe to expose: row-level security is what protects the data. |
| `SUPABASE_SECRET_KEY` | A secret key. Server only. It bypasses row-level security, so never give it to a build that runs untrusted code, such as a preview deployment of someone's pull request. Billing uses it, and so does deleting an org, to remove the org's pictures and videos from Storage. Without billing you can leave it out: a deleted org's files then stay in the buckets, unreachable, until you remove them (below). |
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
- **Pictures and videos are files, not rows.** They live in Supabase Storage, which `supabase db dump` does not copy: back the two `media-` buckets up separately if they matter to you (they speak S3). They do not count toward the plan limits; how much each org may keep is capped only if you set a limit ([below](#limiting-storage-optional)). Deleting a node never deletes its file, because a copy of the node may show the same file and undo must be able to bring it back; files are removed when their whiteboard is deleted from the trash for good. What that leaves behind is the files of nodes deleted from whiteboards that still exist, and, on a server without `SUPABASE_SECRET_KEY`, the files of deleted orgs. To list the second kind: `select bucket_id, name from storage.objects where bucket_id like 'media-%' and split_part(name, '/', 1)::uuid not in (select id from public.orgs);` and remove them in the dashboard's Storage browser, never with SQL, which would leave the bytes behind.
- **Public projects.** An admin can make a project readable by anyone with the link. Reports and takedowns are described in the [README](../README.md#public-projects-and-moderation); they are SQL for now.
- **There is no published Docker image.** The repository has a `Dockerfile` (section 4), and the image has to be built with your own Supabase URL and key, so a public one would be of little use.

## Limiting storage (optional)

Anyone who can sign up can upload pictures and videos, and a server open to the public is otherwise free file hosting. To cap how much each org keeps, across both `media-` buckets, set a number of bytes:

```sql
update private.config set media_storage_limit_bytes = 1073741824;  -- 1 GB per org
```

Set it back to `null` to remove the cap, which is where a new server starts. The database enforces it, whatever the client: an upload that would take its org past the cap is refused and its bytes are removed, and people see why in the whiteboard. It applies to every org, paid or not. Settings → General shows each org how much it uses while a cap is set. Lowering the cap below what an org already keeps deletes nothing; it only refuses new files until the org is back under it. A file counts until its whiteboard is deleted from the trash, including the files of nodes deleted from a whiteboard that still exists (see [Things to know](#things-to-know)).

The deploy workflow can keep it set for you: add the repository variable `MEDIA_STORAGE_LIMIT_BYTES` (a whole number of bytes, or `none`). Leave it unset to leave the database as it is.

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
