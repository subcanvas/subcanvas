# Graph Notes — Data Model and Build Order

Companion to [REQUIREMENTS.md](../REQUIREMENTS.md). Requirement IDs in parentheses.

## 1. Where state lives

| State | Lives in | Why |
|---|---|---|
| Orgs, members, roles, projects, folders, billing | Postgres tables | Relational, enforced by RLS |
| Document **metadata**: title, type, parent, counts toward limit | Postgres `documents` row | The sidebar tree, breadcrumbs, and search need it without loading content |
| Document **content**: whiteboard nodes/edges, BlockNote blocks | A Yjs document per Document, persisted to Postgres as binary | Conflict-free real-time editing (R5.1) |
| Links between documents | Postgres `document_links`, mirrored in the node/edge/block data inside the Yjs document | "Referenced by" (R1.7) and delete warnings (R1.8) need a queryable index; the canvas needs the link locally to render |
| Cursors, selections, who is online | Supabase Realtime presence, never persisted | Ephemeral (R5.2) |

The Next.js app holds no state. Everything is in Supabase, so the app runs on any Node host (R8.4).

## 2. Tables

```
profiles          id (= auth.users.id), display_name, avatar_url

orgs              id, name, slug, created_by
org_members       org_id, user_id, role: owner|admin|editor|viewer        (R6.3)
org_invites       id, org_id, email, role, token, expires_at, accepted_at  (R6.4)

projects          id, org_id, name
folders           id, project_id, parent_folder_id?, name, position

documents         id, org_id, project_id
                  type: whiteboard|text                                    (R1.2)
                  kind: standard|description                               (R4.2, R7.1a)
                  title
                  -- exactly one parent (R1.4), enforced by a CHECK:
                  folder_id?                     -- home is a folder
                  parent_document_id?            -- home is inside another document
                  parent_object_id?              -- ...specifically this node/edge/group in it
                  position, created_by, created_at, updated_at, deleted_at?

document_links    id, org_id                     -- references only; see note below
                  source_document_id
                  source_object_id               -- node/edge/group id, or BlockNote block id
                  target_document_id                                       (R1.5, R1.6)

document_snapshots  document_id (pk), state bytea, updated_at
document_updates    id bigserial, document_id, update bytea, created_by, created_at

subscriptions     org_id (pk), stripe_customer_id, stripe_subscription_id,
                  status, seats, current_period_end                        (R7.3)
```

Notes:

- **Project root documents** have `folder_id = null` and `parent_document_id = null`; the CHECK allows at most one parent pointer, and none means project root.
- **No parent cycles (R1.9):** a trigger walks `parent_document_id` upward on insert/update and rejects loops. References are unconstrained.
- **Links are an index, not the truth.** A document's home is recorded on the document (`parent_document_id`, `parent_object_id`), so `document_links` holds only references to documents that live elsewhere. The content is the source of truth: a whiteboard object's `docId`, or a `documentLink` block in a text document. Editors' clients reconcile the table against the content about 1.5 s after the links change, which also covers undo, paste, and merges. "Referenced by" and delete warnings are then plain queries.
- **Soft delete:** `deleted_at` gives a trash and makes R1.8 recoverable. Children of a deleted document are hidden with it.
- **Plans (R7).** Free orgs get unlimited documents in public projects, a capped number in private projects, and a capped number of editors; paid orgs have no caps. All of it is enforced by triggers, so no client can bypass it: on `documents` (create, restore from trash), on `projects` (public to private), and on `org_members` (a new editor, or a viewer promoted). The limits live in `private.config` and are `null`, meaning off, unless a deployment that sells subscriptions sets them. The default favors self-hosters: forgetting to turn limits on costs the hosted service some free usage, while forgetting to turn them off would block a self-hosted team behind an upgrade button that leads nowhere.
- **Lapse.** `subscriptions.lapsed_at` is stamped by a trigger when the status leaves the paid set (`active`, `trialing`, `past_due`; past due stays paid while Stripe retries the card). A lapsed org with more editors than the free plan allows is read-only for non-owners once `lapse_grace` (14 days) has passed. This is one change inside `private.has_org_role`: every write policy, including the Realtime channel policies, asks for at least `editor` through that function, so the whole schema follows. Without it, one paid month would buy unlimited editors forever. Nothing is deleted and nothing is ever made public.
- **Billed seats (R7.2a, R7.4):** editors are `org_members` with `role <> 'viewer'`. The server actions that change membership (role change, removal, accepting an invite) call `syncSeats`, which sets the Stripe quantity; the webhook then records it. This replaced the planned trigger plus Edge Function: less machinery, and it runs on any Node host. Membership changed directly in the database is not synced until the next change made through the app.
- **Why the plan looks like this.** The cost of serving the product is live collaboration, not storage: Supabase bills each Realtime message once when sent and once per recipient, so a room of editors costs roughly the square of its size, while a hundred stored documents cost almost nothing. Charging per editor puts the price where the cost is. Public-is-free makes free users' work into pages that advertise the product, and the private document allowance lets a company evaluate with real, confidential data.

## 3. Shape of a Yjs document

**Whiteboard**
```
nodes: Y.Map<nodeId, Y.Map>     type: plain|text|group, position, width, height,
                                parentId? (group membership, R3.10), title, description?,
                                color, docId?, openMode: panel|navigate
edges: Y.Map<edgeId, Y.Map>     source, target, sourceHandle, targetHandle,
                                shape: spline|step, stroke: solid|dotted,
                                direction: none|forward|reverse|both,
                                color, label?, docId?, openMode
```
Maps keyed by id, with a nested map per object, so two users editing different properties of the same node merge cleanly. Groups are nodes with `type: group`; children point at them through `parentId`, which is how React Flow models sub-flows. Undo/redo (R3.14) uses `Y.UndoManager`, scoped to the local user.

**Text doc:** the `Y.XmlFragment` that BlockNote's collaboration mode manages. The embedded-document block (R2.5) is a custom block with a `docId` prop.

## 4. Real-time sync over Supabase Realtime (R5.1a)

A custom Yjs provider, one Realtime channel per document (`doc:<id>`):

1. **Open:** fetch the snapshot plus any later rows from `document_updates`, apply them, then join the channel.
2. **Edit:** local Yjs updates are batched (~100 ms), broadcast on the channel **only when someone else is connected**, and appended to `document_updates` (debounced ~1 s, merged with `Y.mergeUpdates`).
3. **Catch-up:** on join and on reconnect, peers exchange state vectors and send each other only the missing diff. A client that missed broadcasts recovers from peers or from the database.
4. **Compaction:** when a document has more than ~200 update rows, a client (or a scheduled Edge Function) writes a fresh snapshot and deletes the rows it covers, in one transaction.
5. **Presence:** editors announce themselves through Realtime presence (avatars) and send whiteboard cursors and text carets through the Yjs awareness protocol over broadcast, at about 8 updates per second, in canvas coordinates so they land on the same spot at any zoom. A client says goodbye on page hide so peers drop it at once.
6. **Viewers hold no Realtime connection.** They re-read the snapshot and update log every 20 s while the tab is visible. The same request is their heartbeat into `document_viewers` (an unlogged table), and it returns how many viewers are live; editors fetch that count on their 30 s backstop. So "N watching" covers free and anonymous viewers at the cost of one small query each, where a presence per viewer would announce every join to everyone in the room.
7. **Cost controls.** Alone in a document, a client broadcasts nothing (it still persists); whoever joins next catches up from the database and the state-vector exchange. Measured locally: joining sends 4 frames, and editing alone sends none.

**Authorization:** channels are private. Realtime authorization policies let org members subscribe and let only editors and above broadcast. RLS on `document_updates` blocks viewer writes. A viewer therefore cannot change a document even with a modified client (R5.5).

**Deviations from the original plan, decided during the milestone 2 spike:**

- Text carets and selections use the standard Yjs awareness protocol sent over broadcast, because that is what BlockNote's cursor plugin reads. Viewers cannot broadcast, so they see other people's carets but have none of their own. Whiteboard cursors work the same way. Viewers were later taken off Realtime entirely (step 6) and are shown as a count instead.
- Catch-up has three layers instead of one: the state-vector exchange is two-way, a client that detects a gap (Yjs reports updates waiting on missing predecessors) re-reads the database, and every client re-reads the database after joining, on reconnect, and every 30 s while visible. The database re-read is the only catch-up path for viewers.

**Spike results (local Supabase, two browsers):**

| Risk | Result |
|---|---|
| Live editing both ways | Works. Remote text and labeled carets appear in well under a second. |
| Disconnect and reconnect | Works. Both sides edited while one was offline; on reconnect both converged at once with nothing lost. |
| Reload to the same state | Works. About 25 keystrokes persisted as 2 rows. |
| Message size limits | Works. A 239 KB paste arrived live, split into 100 KB chunks. |
| Compaction | Works. 256 update rows became one snapshot, and a fresh client loaded the full document from it. |
| Viewers cannot write | Enforced in three places: no insert on `document_updates`, no broadcast on the channel (both covered by pgTAP tests of the policies), and a read-only editor. |
| One Y.Doc per document (R5.4) | Built (`use-document-sync.ts` shares one provider per document id). Not exercised until the side panel exists in milestone 5. |

Not yet tested: hosted Supabase (rate limits and latency differ from local), more than two clients, and long sessions across an auth token refresh.

## 5. Routes and breadcrumbs

```
/login
/[org]                                   project list
/[org]/settings/{members,billing}
/[org]/[project]                         tree, empty state
/[org]/[project]/d/[docId]?via=a.b.c     document page
/p/[projectId]                           public project (anyone with the link)
/p/[projectId]/d/[docId]?via=a.b.c       public document, read-only
```

`via` is the list of document ids navigated through to get here (R2.3). Returning to a document already on the trail truncates it, so reference loops cannot grow the URL. The breadcrumb is `via` plus the current document. Navigating into a child appends the current id; clicking a crumb truncates. With no `via`, the breadcrumb falls back to the canonical chain from `parent_document_id` (R2.2). One query resolves all ids to titles.

**Public projects (R6.6, R6.7).** A public page renders the same components as the app with editing off. What lets an anonymous visitor read is row-level security: `select` policies for the `anon` role on projects, folders, documents, snapshots, updates, and links, all conditioned on the project being public and not taken down, with column grants that keep internal fields out. There is no privileged server code on the read path, so a bug in a page cannot leak a private project; the database would refuse. Links inside the app are built as `/<org slug>/<project id>/...`; a public page passes the reserved slug `p` instead, so every existing link lands on the public route with no second set of link builders. Visitors hold no Realtime connection (section 4, step 6). Pages are `noindex`. Reports go to `abuse_reports`, readable only by the operator, who can set `projects.taken_down_at` to override an org's own visibility setting.

## 6. Build order

| # | Milestone | Done when |
|---|---|---|
| 0 | **Scaffold.** Next.js, TypeScript, Tailwind, shadcn/ui, Supabase CLI with local stack and migrations, lint, CI. | App boots against local Supabase. |
| 1 | **Auth and orgs.** Magic link, Google, GitHub. Orgs, members, roles, invites, RLS on every table, RLS tests. | Two users in two orgs cannot see each other's data; a viewer cannot write. |
| 2 | **Sync spike.** The Yjs provider over Supabase Realtime from section 4, tested with a bare BlockNote editor. Built early because it is the riskiest piece and everything after it depends on it. | Two browsers edit one text doc, survive a disconnect, and reload to the same state. |
| 3 | **Documents and tree.** Projects, folders, documents, sidebar tree, create/rename/move/trash, text doc page. | A user can organize and write text docs. |
| 4 | **Whiteboard.** React Flow bound to Yjs. Plain nodes, text nodes, edges with all options, groups and nested groups, toolbar, undo/redo. | All of section 3 of the requirements works with two users at once. |
| 5 | **Side panel.** Settings for nodes, edges, and groups. Description documents created on first edit and edited in the panel. | Requirements R4.1 to R4.6 work. |
| 6 | **Nesting.** Attach new or link existing documents, double-click navigation, open mode, `via` breadcrumbs, embedded-document block, "Referenced by", delete warnings. | The microservice example from the requirements intro works end to end. |
| 7 | **Presence.** Cursors, carets, avatars. | Visible across two browsers. |
| 8 | **Billing.** Document limit trigger, upgrade prompt, Stripe Checkout, Customer Portal, webhooks, seat sync. | A free org is blocked at 25 documents, upgrades, and is unblocked. |
| 9 | **Launch.** Landing page, themes, image uploads, self-hosting guide, README. | A stranger can self-host from the docs. |
