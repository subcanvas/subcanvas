# Operating a Subcanvas server

What whoever runs a server does by hand: reviewing abuse reports, taking a project down and putting it back, deleting an account when its owner cannot, seeing what new accounts do, and reading what went wrong. None of it has a page in the app. Every step is SQL, run in the Supabase dashboard's SQL editor (or `psql`) as the database owner, which row-level security does not apply to. Tables and columns keep their original names: a workspace is a row in `orgs`.

## Abuse reports

Every public page has a Report button. A report is stored in `public.abuse_reports`: the project, the page it was sent from, the reason, and the reporter's email if they left one. When the server sends email (`SMTP_HOST`, see [DEPLOYMENT.md](DEPLOYMENT.md)), each report is also emailed to `ABUSE_EMAIL`, or to `LEGAL_CONTACT` when `ABUSE_EMAIL` is not set, with the project's public link and the SQL that takes it down. Replying to that email writes to the reporter, when they left an address. A project takes at most 20 reports an hour; the rest are neither stored nor emailed.

### Reviewing a report

1. Open the project's public link from the email, or `https://<your domain>/p/<project id>`, which leads to the project's address, in a private window where you are signed out. That is what the reporter saw.
2. Read the recent reports, with the project and its workspace:
   ```sql
   select r.created_at, r.reason, r.reporter_email, r.document_id,
          p.id as project_id, p.name as project, p.visibility, p.taken_down_at,
          o.name as workspace, o.slug
   from public.abuse_reports r
   join public.projects p on p.id = r.project_id
   join public.orgs o on o.id = p.org_id
   order by r.created_at desc
   limit 50;
   ```
3. Find who to write to about it, the workspace's owners and admins:
   ```sql
   select pr.email, m.role
   from public.org_members m
   join public.profiles pr on pr.id = m.user_id
   where m.org_id = (select org_id from public.projects where id = '<project id>')
     and m.role in ('owner', 'admin');
   ```
4. Decide. The Terms promise reporters that their identity is not disclosed to the people they reported, so never pass a reporter's address on. Reports stay in the table after they are handled (there is no status to set) and are deleted with their project.

### Taking a project down

```sql
update public.projects set taken_down_at = now() where id = '<project id>';
```

At once, and whatever the project's own setting, nobody outside its workspace can read it: not its public link, the documents under it, their embed pictures, or their pictures and videos. The check is in row-level security (`private.project_is_public`), not in the app. Its members still open and edit it. Its card on the Projects page says Taken down, and its Share button says what that means and gives `ABUSE_EMAIL` or `LEGAL_CONTACT` as the address to write to. The workspace cannot undo a takedown: members have no grant on `taken_down_at`, and making the project private and then public again changes nothing while it is set.

Then tell the workspace's owners (the query above): which project, and why.

### Reversing a takedown

```sql
update public.projects set taken_down_at = null where id = '<project id>';
```

The project is then exactly as public as its own setting says. If it is still set to public, its old link works again at once; if the workspace made it private in the meantime, it stays private.

## Deleting an account by hand

For when a person cannot delete their account themselves. Before anything, confirm the request came from the account's own address: reply to it and wait for the answer.

1. Find the account:
   ```sql
   select id, email, created_at from auth.users where email = lower('<email>');
   ```
2. See what deleting it would do to each workspace the person is in:
   ```sql
   select * from private.account_deletion_plan('<user id>');
   ```
   `delete`: their personal workspace, or a team workspace nobody else is in, which goes with everything in it. `leave`: a team workspace other people are in, which keeps what they made there. `only_owner` and `subscribed` stop the deletion, as they would in Profile.
3. For each `only_owner`, ask the person what they want:
   - Someone else becomes its owner:
     ```sql
     update public.org_members set role = 'owner'
     where org_id = '<workspace id>' and user_id = (select id from public.profiles where email = lower('<their email>'));
     ```
   - Or the workspace goes too: they delete it from its Settings, or you run `delete from public.orgs where id = '<workspace id>';` (its files then stay in Storage; list them with the query in [DEPLOYMENT.md](DEPLOYMENT.md#things-to-know) and remove them in the dashboard's Storage browser).

   For each `subscribed`, cancel the subscription in Stripe first, or its card goes on being charged.
4. Delete the account, in one transaction, with the same function Profile uses:
   ```sql
   select * from public.delete_account('<user id>');
   ```
   It deletes the workspaces marked `delete` with everything in them, then the account, its profile and memberships. What they made in the workspaces they left stays there with no author. It returns the pictures and videos of the deleted workspaces: remove those in the dashboard's Storage browser, never with SQL, which would leave the bytes behind.
5. Reply to say it is done.

## Seeing what new accounts do

The server keeps a step record: for each account, the first time it reached each of a few steps, and nothing else. It is written by the database and the app's own server, never by a script in the browser, and sets no cookie. It holds the step's name and when it was reached, never what anyone wrote or drew, titles, or addresses. The rows belong to the account and are deleted with it, by `delete_account` or by deleting the user in the dashboard. The Privacy Policy says so. Nobody but the database owner and the server's secret key can read any of it.

| Step | Recorded when |
|---|---|
| `signed_up` | The account is created, whichever way (its time is the account's). |
| `opened_github_import` | The Import from GitHub dialog opens. |
| `imported_repository` | An import from GitHub succeeds, from the dialog or by an agent. |
| `imported_files` | A batch of imported files is written, from the project or by an agent. |
| `created_project` | A project is made with New project, by the person or their agent. An imported one is `imported_repository` instead. |
| `created_whiteboard` | A whiteboard is made, not one an import draws. |
| `made_edit` | A change to a document is saved, in the editor or by their agent, not what an import writes. |
| `invited_someone` | An invite is made or renewed. |
| `connected_agent` | They approve an agent on the consent screen. |
| `opened_billing` | They open a workspace's Billing page. |
| `upgraded` | A workspace they own starts paying for Pro. |
| `came_back` | They open a workspace, or reach any other step, on a later day (UTC) than the one they signed up on. |

Steps reached before this record existed are not in it, except `signed_up`, `created_project` and `imported_repository`, which were filled in from the rows that already existed.

### The emails

When the server sends email (`SMTP_HOST`), it writes to `OPERATOR_EMAIL`, or to `LEGAL_CONTACT` when that is not set:

- **About each new account**, once, when the account first opens a workspace in its first day: who (name and address), how they signed up (email, Google or GitHub), and when. It has no links. It is sent once the workspace has been shown, so signing up never waits on it, and a failure is only logged.
- **A summary of each day** (UTC): the accounts that signed up and every step each has reached so far, the accounts that signed up earlier and were active that day (signed in, used a session in the app or through an agent, edited, or reached a step) with what they did for the first time, how many accounts reached each step, and how many accounts there are. On Vercel, the cron job in `vercel.json` asks for it at 13:00 UTC for the day before. Elsewhere, or to have any day again:
  ```sh
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://<your domain>/api/cron/daily-summary?day=2026-10-05"
  ```
  The route needs `CRON_SECRET` and `SUPABASE_SECRET_KEY` ([DEPLOYMENT.md](DEPLOYMENT.md)). Without `CRON_SECRET` it refuses every request.

### Reading it

`private.account_activity` has one row per account, from the step record and the data that already exists:

```sql
select * from private.account_activity order by signed_up_at desc limit 50;
```

| Column | What it is |
|---|---|
| `email`, `signed_up_at`, `signed_up_with`, `confirmed` | The account, when it was made, how (`email`, `google` or `github`), and whether its address is confirmed. |
| `personal_workspace` | Its personal workspace's address. |
| `team_workspaces_created`, `team_workspaces_joined` | Team workspaces it made, and others it is a member of. |
| `projects_created`, `repositories_imported`, `imported_files` | Projects it made (imported ones included), how many came from GitHub, and whether it ever imported files. |
| `whiteboards_created`, `pages_created` | Documents it made, the trashed ones included, descriptions not. |
| `invites_open` | Its invites nobody has accepted yet. An accepted invite is deleted, so `invited_someone` in `steps` says whether it ever sent one. |
| `plan` | `Pro` when a workspace it owns pays, else `Free`. |
| `last_sign_in_at`, `last_active_at` | When it last signed in, and when one of its sessions, in the app or an agent's, was last used. |
| `last_edit_at` | Its latest edit still in the log. A document's log is compacted every couple of hundred edits, so this can be earlier than its real last edit, or empty. |
| `came_back` | Whether it did anything on a later day than it signed up. |
| `steps`, `step_times` | The steps it has reached, in order, and when it reached each. |

How far the accounts of the last week got:

```sql
select s.step, count(*) as accounts
from private.account_steps s
join auth.users u on u.id = s.user_id
where u.created_at > now() - interval '7 days'
group by s.step
order by s.step;
```

Who signed up and did nothing else:

```sql
select email, signed_up_at, signed_up_with
from private.account_activity
where steps = array['signed_up']
order by signed_up_at desc;
```

A day, as its summary email sees it:

```sql
select jsonb_pretty(public.daily_activity('2026-10-05'));
```

## Errors

What goes wrong is kept in the database, not sent to anyone: errors the server catches (`onRequestError` in `src/instrumentation.ts`, which also writes one line of JSON to the function log), and errors in people's browsers that nothing caught, which the app posts from the browser to `/api/errors`. Each distinct error is one row of `private.error_reports`, grouped by a fingerprint of its name, its message without numbers and ids, and the top frames of its stack, and counted each time it happens again.

A row says where and what, never who: the route as a pattern (`/[org]/[project]/[doc]`, never a real address, id or query string), the message and stack with ids, numbers, email addresses and the server's own file paths taken out, and the release (`VERCEL_GIT_COMMIT_SHA`) when there is one. No account, IP address, cookie, header, request body or document content. The browser sends each error once per tab, at most 20 a tab; the route takes 20 reports a minute from one address (kept in memory for the limit, never stored) and adds at most 500 new distinct browser errors a day, while it goes on counting known ones. The daily cron deletes the errors not seen for 30 days, and its summary email lists how often things went wrong that day and the five errors that happened most.

Without `SUPABASE_SECRET_KEY` nothing is stored, and the function log has the server's errors as before, and the browser's as `browser_error` lines.

What is going wrong most at the moment:

```sql
select count, source, route, name, message, first_seen, last_seen, release
from private.error_reports
order by last_seen desc, count desc
limit 20;
```

What happened on a day, and how often:

```sql
select d.count, r.source, r.route, r.name, r.message, r.first_seen
from private.error_days d
join private.error_reports r on r.fingerprint = d.fingerprint
where d.day = '2026-10-05'
order by d.count desc;
```

One error's stack, with its fingerprint from the query above:

```sql
select stack from private.error_reports where fingerprint = '<fingerprint>';
```

Once an error is fixed, delete its row, or leave it: if it does not come back it goes after 30 days.

```sql
delete from private.error_reports where fingerprint = '<fingerprint>';
```
