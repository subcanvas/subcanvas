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

document_links    id, org_id
                  source_document_id
                  source_object_id?              -- node/edge/group id, or BlockNote block id
                  target_document_id
                  kind: parent|reference                                   (R1.5, R1.6)

document_snapshots  document_id (pk), state bytea, state_vector bytea, updated_at
document_updates    id bigserial, document_id, update bytea, created_by, created_at

subscriptions     org_id (pk), stripe_customer_id, stripe_subscription_id,
                  status, seats, current_period_end                        (R7.3)
```

Notes:

- **Project root documents** have `folder_id = null` and `parent_document_id = null`; the CHECK allows at most one parent pointer, and none means project root.
- **No parent cycles (R1.9):** a trigger walks `parent_document_id` upward on insert/update and rejects loops. References are unconstrained.
- **Soft delete:** `deleted_at` gives a trash and makes R1.8 recoverable. Children of a deleted document are hidden with it.
- **Free-tier limit (R7.1):** a `BEFORE INSERT` trigger on `documents` counts rows where `kind = 'standard'` and `deleted_at is null` for the org, and rejects the insert when the org has no active subscription and the count is 25. Enforced in the database so no client can bypass it.
- **Billed seats (R7.2a):** `count(*) from org_members where role <> 'viewer'`. A trigger on `org_members` marks the org for a Stripe quantity sync, which a Supabase Edge Function performs.

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
2. **Edit:** local Yjs updates are batched (~50 ms), broadcast on the channel, and appended to `document_updates` (debounced ~1 s, merged with `Y.mergeUpdates`).
3. **Catch-up:** on join and on reconnect, peers exchange state vectors and send each other only the missing diff. A client that missed broadcasts recovers from peers or from the database.
4. **Compaction:** when a document has more than ~200 update rows, a client (or a scheduled Edge Function) writes a fresh snapshot and deletes the rows it covers, in one transaction.
5. **Presence:** cursors and selections go through Realtime presence, throttled to ~15 updates per second.

**Authorization:** channels are private. Realtime authorization policies let org members subscribe and let only editors and above broadcast. RLS on `document_updates` blocks viewer writes. A viewer therefore cannot change a document even with a modified client (R5.5).

**Known risks, to validate in the milestone 2 spike:** Realtime message size and rate limits (large pastes need chunking), broadcast is not guaranteed delivery (step 3 covers this), and the side panel and standalone page must share one Yjs document instance per document id (R5.4).

## 5. Routes and breadcrumbs

```
/login
/[org]                                   project list
/[org]/settings/{members,billing}
/[org]/[project]                         tree, empty state
/[org]/[project]/d/[docId]?via=a.b.c     document page
```

`via` is the list of document ids navigated through to get here (R2.3). The breadcrumb is `via` plus the current document. Navigating into a child appends the current id; clicking a crumb truncates. With no `via`, the breadcrumb falls back to the canonical chain from `parent_document_id` (R2.2). One query resolves all ids to titles.

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
