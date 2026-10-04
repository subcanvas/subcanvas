# The MCP server

Subcanvas speaks the [Model Context Protocol](https://modelcontextprotocol.io). An agent (Claude, ChatGPT, Cursor, or anything else that speaks MCP) connected to it can read and edit Subcanvas as the person who connected it: list their projects, draw and rearrange whiteboards, write pages, nest a whiteboard inside a box. The reasoning behind it is in [ROADMAP.md](ROADMAP.md#2-full-access-mcp-server).

- **Endpoint:** `https://<your domain>/mcp` (streamable HTTP, stateless). Both the 2025 protocol and 2026-07-28 are served. The tool list never changes while an agent is connected, so there is nothing to listen for: the server says `listChanged: false`, and a client opens no `subscriptions/listen` stream.
- **Sign-in:** OAuth 2.1, with Supabase Auth as the authorization server. There are no API keys.
- **Code:** `src/app/mcp/route.ts` (the endpoint), `src/lib/mcp/` (tools), `src/app/oauth/consent/` (the approval page).

## Connecting

Every workspace has a page with the address and the quickest way into each client: `/<workspace>/agents`. In short:

| Client | How |
|---|---|
| Claude Code | `claude mcp add --transport http subcanvas https://<your domain>/mcp`, then `/mcp` to sign in |
| Codex (CLI, IDE extension, ChatGPT desktop) | `codex mcp add subcanvas --url https://<your domain>/mcp`, then `codex mcp login subcanvas` |
| Cursor | The "Add to Cursor" button, or `{ "mcpServers": { "subcanvas": { "url": "https://<your domain>/mcp" } } }` in `~/.cursor/mcp.json` |
| VS Code | The "Add to VS Code" button, or `{ "servers": { "subcanvas": { "type": "http", "url": "https://<your domain>/mcp" } } }` in `mcp.json` |
| Claude (claude.ai, desktop) | Customize → Connectors → + → Add custom connector → paste the address |
| ChatGPT | Settings → Security and login → Developer mode; then add an app with the address as its public endpoint |

What happens next is the same everywhere. The client asks `/mcp` without a token and gets a `401` whose `WWW-Authenticate` header points at `/.well-known/oauth-protected-resource`. That document names Supabase Auth as the authorization server. The client reads Supabase's metadata, registers itself, and opens a browser. The person signs in to Subcanvas if they are not already, sees "Let *client* use Subcanvas as you?" at `/oauth/consent`, and approves. The client gets an access token and a refresh token, and uses the server.

## Tools

Everything is addressed by id. Writes are marked in their MCP annotations as plain writes or as destructive, so a client can ask before it deletes something.

The tools use the app's words (the glossary is in [REQUIREMENTS.md](../REQUIREMENTS.md#glossary)), with a few older names kept for compatibility: a page is a document of type `text` and its tools say "text document", arrows are `edges`, a box is a node of kind `plain`, and a picture or video is kind `media`. A node's `description` is a text node's body text; the page inside a node or arrow, which the app calls its description, is a document it holds (`attach_document`).

| Tool | What it does | Kind |
|---|---|---|
| `list_workspaces` | List workspaces | reads |
| `list_projects` | List projects | reads |
| `get_project` | Get a project and its document tree | reads |
| `create_project` | Create a project | writes |
| `set_project_visibility` | Make a project public or private | writes |
| `rename_project` | Rename a project | writes |
| `create_document` | Create a document | writes |
| `import_markdown_documents` | Import Markdown files as documents | writes |
| `create_folder` | Create a folder | writes |
| `rename_document` | Rename a document or folder | writes |
| `move_document` | Move a document or folder | writes |
| `trash_document` | Move a document or folder to the trash | destructive |
| `restore_document` | Restore a document or folder from the trash | writes |
| `delete_document_forever` | Delete a trashed document or folder forever | destructive |
| `list_references` | List what links to a document, or to anything in a folder | reads |
| `read_text_document` | Read a page | reads |
| `append_markdown` | Append Markdown to a page | writes |
| `insert_after_block` | Insert Markdown after a block | writes |
| `replace_block` | Replace a block | destructive |
| `delete_block` | Delete a block | destructive |
| `read_whiteboard` | Read a whiteboard | reads |
| `add_nodes` | Add nodes to a whiteboard | writes |
| `update_nodes` | Update nodes | writes |
| `delete_nodes` | Delete nodes | destructive |
| `connect_nodes` | Connect nodes with arrows | writes |
| `update_edges` | Update arrows | writes |
| `delete_edges` | Delete arrows | destructive |
| `create_group` | Create a group | writes |
| `set_group_membership` | Move nodes into or out of a group | writes |
| `arrange_nodes` | Lay out a whiteboard automatically | destructive |
| `import_mermaid` | Draw a Mermaid diagram on a whiteboard | writes |
| `attach_document` | Put a document inside a node or arrow | writes |
| `detach_document` | Detach the document from a node or arrow | writes |
| `import_github_repository` | Draw a GitHub repository as a project | writes |
| `get_embed_snippet` | Get the embed snippet of a public whiteboard | reads |

Something in the trash, or inside a folder or document that is, is in the trash to the tools as it is in the app. `read_text_document` and `read_whiteboard` still read it and say so; every tool that writes to it refuses, and so does creating or moving anything into it, until it is restored. `detach_document` lets go of what a node or arrow held: it becomes a document of its own under the whiteboard, in the project tree, and deleting the node later leaves it alone.

A project the operator took down after a report (docs/OPERATIONS.md) is public to nobody, whatever its visibility says: `list_projects`, `get_project` and `set_project_visibility` say `taken_down: true` and why, as the app does, and `get_embed_snippet` refuses its whiteboards.

Text is edited by block: `read_text_document` returns each top-level block with a stable id, and the editing tools name the block they mean. Nothing is addressed by position or by matching text, so an edit made against a read that is a second old still lands where it was meant to.

Blocks are read and written as Markdown. The blocks Markdown has no syntax for are written like this, both ways:

| Block | Markdown |
|---|---|
| Equation | `$$`, the TeX, `$$`, each on a line of its own (or `$$ x^2 $$` on one line) |
| Maths in a line | `$e^{i\pi} + 1 = 0$`: the dollar signs hug the TeX, so `$5 and $10` stays text |
| Callout | `<aside data-icon="💡">`, a blank line, the callout's Markdown, a blank line, `</aside>`. `data-background-color` picks its colour: gray (the default), brown, red, orange, yellow, green, blue, purple, pink. Notion's Markdown export, `<aside>💡 Text</aside>`, reads the same way. |
| Table of contents | `[TOC]` on a line of its own |

A bookmark reads as a link on its own line, and a row of columns as its columns' blocks one after the other; neither can be written from Markdown. Blocks inside a column have ids like any other, so they can be edited, and deleting the last block of a column removes the column.

Nodes take what the canvas takes, and no more: the same words (a title up to 200 characters, body text up to 2,000, an arrow's label up to 120, alt text up to 500), the same sizes (a box can be no smaller than 80 by 40, a text node 120 wide, a group 160 by 100, a picture or video 48 on either side, and nothing larger than 4,000; a size outside that is brought within it), a box's shape at that shape's size, and a picture or video at its file's proportions. The limits are defined once, in `src/lib/whiteboard/limits.ts`. A field a node cannot show is refused rather than stored where nobody would see it: body text on a box, a shape on a group, alt text on anything but a picture or video, a color on a picture or video.

Most agents write Mermaid fluently, so `import_mermaid` is the quickest way to a whole diagram: one call with a flowchart, a sequence diagram or an ER diagram makes a new whiteboard (or adds to one) of real boxes, groups and arrows, laid out in the diagram's direction, which people then click into and edit like any other. It returns the node id each Mermaid id became, for `attach_document` and the rest, and lists whatever the whiteboard does not show (styles, notes, loops). `add_nodes` and `connect_nodes` remain the tools for small changes. What is drawn, and how, is in [IMPORTING.md](IMPORTING.md#mermaid-diagrams).

Deleting works as it does in the app. A document or folder goes to the project's trash with everything inside it, and `restore_document` brings it back; only something already in the trash can be deleted for good. Deleting a node or arrow (`delete_nodes`, `delete_edges`) sends what it held, its description or the whiteboard inside it, to the trash too, and the result names what went there. A plan limit is refused with what the limit is, and, where the server sells a plan, that an owner can upgrade.

Pictures and videos on a whiteboard are read, not written. `read_whiteboard` reports each with its caption, alt text, the file's size in pixels, and a link that the people who can read the whiteboard can open; `update_nodes` can move it, caption it, and write its `alt` text; `delete_nodes` removes it, and its file with it, since an agent has no undo. There is no upload tool, for two reasons. A file sent through a tool call would pass through the app's server, which is exactly what uploads avoid (hosts such as Vercel cap a request at about 4.5 MB; the browser sends files straight to Storage). And a tool that fetched a picture from an address would make the server fetch whatever a prompt-injected document asked it to. Uploading is not a server action either, so the parity test has nothing to say about it: it is the browser talking to Storage under the same row-level security an agent's token would meet.

`scripts/mcp/client.mjs` calls one tool from the command line, and `scripts/mcp/smoke.mjs` drives every tool as three people and checks the results. Both sign in with a password, against a local stack.

### Not exposed yet

Members and invites, billing, creating, renaming, leaving, or deleting a workspace, deleting a project, deleting your account, your own name and picture, revoking an agent, and the consent screen itself have no tools. The reasons are beside the list in `src/lib/mcp/parity.test.ts`, which fails when a server action is added without either a tool or an entry in that list. In short: they change who has access, cannot be undone, or are a person's own decision; an agent must never approve or disconnect agents, since that is how a person keeps control of them.

Some things people do in the browser are not server actions, so the parity test cannot see them, and have no tool either:

- **Which side an arrow leaves and enters by.** A person drags from one side of a node to a side of another. `connect_nodes` picks the sides that make the shortest path, `arrange_nodes` picks them again, and `read_whiteboard` does not report them. Choosing sides is layout by hand, which an agent does better by moving nodes.
- **Document links in a page.** The card that links a page to another document is inserted from the page's `/` menu. Markdown has no syntax for it, so `read_text_document` shows one as `[Subcanvas document <id>]` and none of the tools write one. The Linked from list is kept by the browsers of people editing the page, so a link card an agent deletes with `delete_block` still counts in `list_references` until someone next edits that page.
- **Uploading pictures and videos to a page**, for the reasons given above for whiteboards. A picture already in Subcanvas can be shown in a page by its `/api/media/…` address in Markdown image syntax; the app copies the file under that page the next time someone who can edit it opens it, so that the page's readers can see it.
- **Copy, paste, and undo.** These live in a person's browser. An agent's edits are its own, and a person's undo never takes them back.

Downloads and exports ([EXPORTING.md](EXPORTING.md)) have no tools either. A tool's result is text for an agent to read, and a project's zip is a file. What is in it an agent already reads, better suited to editing: `read_text_document` returns the same Markdown as a download, block by block with ids, and `read_whiteboard` the same contents as a whiteboard's JSON file. The reasons are kept in the same test, beside the routes that serve the downloads.

## Security model

In plain words: **the agent is you, and the database decides what you may do.**

- **The token is the person's own.** Supabase Auth issues an MCP client the same kind of JWT it issues a browser, for the person who approved it. The server checks its signature against the project's published keys, its issuer, its audience, and that it belongs to a signed-in person.
- **Every tool call uses a Supabase client that carries that token.** Row-level security then decides what can be read and written, exactly as it does for the web app. A viewer's agent can read and cannot write. An agent cannot see a workspace its person is not in; to it, those things do not exist.
- **An agent can be disconnected.** Settings → Profile → Connected agents lists every agent the person approved, with Revoke. Revoking withdraws the consent, deletes the agent's sessions and refresh tokens, and takes effect at its next request: for a token issued to an agent, the server also asks Supabase Auth whether its session still exists, one extra request per call. To come back, the agent has to be approved again.
- **There is no secret key behind the server.** The MCP code never imports the admin client, and the endpoint works without `SUPABASE_SECRET_KEY` being set. A bug in a tool can do no more than its caller could do from their browser's console.
- **The same rules and limits.** Tools call the functions the server actions call (`src/lib/documents/operations.ts`), so role checks, free-plan limits, and their messages are the same. Imported READMEs are read-only for agents as they are for people.
- **Edits are Yjs updates.** A tool call reads the document from Postgres, applies its change, and appends one update to `document_updates`, so it merges with what people are typing. It is then sent to the document's Realtime channel over HTTP, where Realtime applies the channel's policies to the caller's token, so open editors show it at once. A browser that misses that picks it up on its next re-read, within 30 seconds. A person's undo never undoes an agent's work.
- **Nothing is kept between requests.** One short-lived server is built per request, for one caller.

Known gaps:

- **An agent gets everything its person has.** Supabase's OAuth scopes describe identity (`openid`, `email`), not access to data, so "read only" or "only this project" cannot be offered on the consent screen yet. A token issued to an MCP client carries a `client_id` claim, which row-level security could use to narrow it later.
- **Tokens are not bound to this server.** Supabase Auth does not implement resource indicators (RFC 8707), so the `aud` claim is `authenticated` and not the address of `/mcp`. The token is as powerful as the person's browser session, and an MCP client that holds it could call the Supabase API directly. It could not do anything there that it cannot do through the tools.
- **A token from an ordinary sign-in is accepted too**, since it is the same kind of token with the same rights. That is what the scripts use.
- **No separate rate limit.** Supabase's own limits apply, per person.

## Turning it on

The MCP endpoint needs nothing but the two public Supabase variables the app already has. Sign-in needs [Supabase's OAuth 2.1 server](https://supabase.com/docs/guides/auth/oauth-server) switched on for the project. Supabase calls it a beta; it is on every plan at no extra charge, and however many agents a person connects, they count as one monthly active user.

| Where | Setting |
|---|---|
| Supabase dashboard → Authentication → OAuth Server | Enable. Authorization Path: `/oauth/consent`. Dynamic client registration: on. |
| Supabase dashboard → Authentication → URL Configuration | Site URL must be the app's address: the consent page is opened at Site URL + the authorization path. |
| Supabase dashboard → JWT signing keys | Use an asymmetric key (ES256 or RS256), so the server can check tokens against the published keys. With a legacy shared secret it still works, but asks Supabase about every request. |
| Management API (`PATCH /v1/projects/<ref>/config/auth`) or the `auth` block of Terraform's `supabase_settings`, instead of the dashboard | `oauth_server_enabled = true`, `oauth_server_authorization_path = "/oauth/consent"`, `oauth_server_allow_dynamic_registration = true` |
| Local development | Already set under `[auth.oauth_server]` in `supabase/config.toml`. Restart the stack once to pick it up. |

Dynamic registration lets any MCP client register itself, which is what makes "paste one address" work; the consent page is the check, and it shows where the client will be connected through. Registered clients are listed under Authentication → OAuth Apps.
