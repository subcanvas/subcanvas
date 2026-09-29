# Operating a Subcanvas server

What whoever runs a server does by hand: reviewing abuse reports, taking a project down and putting it back, and deleting an account when its owner cannot. None of it has a page in the app. Every step is SQL, run in the Supabase dashboard's SQL editor (or `psql`) as the database owner, which row-level security does not apply to. Tables and columns keep their original names: a workspace is a row in `orgs`.

## Abuse reports

Every public page has a Report button. A report is stored in `public.abuse_reports`: the project, the page it was sent from, the reason, and the reporter's email if they left one. When the server sends email (`SMTP_HOST`, see [DEPLOYMENT.md](DEPLOYMENT.md)), each report is also emailed to `ABUSE_EMAIL`, or to `LEGAL_CONTACT` when `ABUSE_EMAIL` is not set, with the project's public link and the SQL that takes it down. Replying to that email writes to the reporter, when they left an address. A project takes at most 20 reports an hour; the rest are neither stored nor emailed.

### Reviewing a report

1. Open the project's public link from the email, or `https://<your domain>/p/<project id>`, in a private window where you are signed out. That is what the reporter saw.
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
