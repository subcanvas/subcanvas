# The MCP server

Subcanvas speaks the [Model Context Protocol](https://modelcontextprotocol.io). An agent (Claude, ChatGPT, Cursor, or anything else that speaks MCP) connected to it can read and edit Subcanvas as the person who connected it: list their projects, draw and rearrange whiteboards, write text documents, nest a diagram inside a box. The reasoning behind it is in [ROADMAP.md](ROADMAP.md#2-full-access-mcp-server).

- **Endpoint:** `https://<your domain>/mcp` (streamable HTTP, stateless).
- **Sign-in:** OAuth 2.1, with Supabase Auth as the authorization server. There are no API keys.
- **Code:** `src/app/mcp/route.ts` (the endpoint), `src/lib/mcp/` (tools), `src/app/oauth/consent/` (the approval page).

## Connecting

Every org has a page with the address and the quickest way into each client: `/<org>/agents`. In short:

| Client | How |
|---|---|
| Claude Code | `claude mcp add --transport http subcanvas https://<your domain>/mcp`, then `/mcp` to sign in |
| Cursor | The "Add to Cursor" button, or `{ "mcpServers": { "subcanvas": { "url": "https://<your domain>/mcp" } } }` in `~/.cursor/mcp.json` |
| VS Code | The "Add to VS Code" button, or `{ "servers": { "subcanvas": { "type": "http", "url": "https://<your domain>/mcp" } } }` in `mcp.json` |
| Claude (claude.ai, desktop) | Customize → Connectors → + → Add custom connector → paste the address |
| ChatGPT | Settings → Security and login → Developer mode; then add an app with the address as its public endpoint |

What happens next is the same everywhere. The client asks `/mcp` without a token and gets a `401` whose `WWW-Authenticate` header points at `/.well-known/oauth-protected-resource`. That document names Supabase Auth as the authorization server. The client reads Supabase's metadata, registers itself, and opens a browser. The person signs in to Subcanvas if they are not already, sees "Let *client* use Subcanvas as you?" at `/oauth/consent`, and approves. The client gets an access token and a refresh token, and uses the server.

## Tools

Everything is addressed by id. Writes are marked in their MCP annotations as plain writes or as destructive, so a client can ask before it deletes something.

| Tool | What it does | Kind |
|---|---|---|
| `list_orgs` | List orgs | reads |
| `list_projects` | List projects | reads |
| `get_project` | Get a project and its document tree | reads |
| `create_project` | Create a project | writes |
| `set_project_visibility` | Make a project public or private | writes |
| `create_document` | Create a document | writes |
| `create_folder` | Create a folder | writes |
| `rename_document` | Rename a document or folder | writes |
| `move_document` | Move a document or folder | writes |
| `trash_document` | Move a document to the trash | destructive |
| `restore_document` | Restore a document from the trash | writes |
| `delete_document_forever` | Delete a trashed document forever | destructive |
| `delete_folder` | Delete a folder | destructive |
| `list_references` | List what links to a document | reads |
| `read_text_document` | Read a text document | reads |
| `append_markdown` | Append Markdown to a text document | writes |
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
| `attach_document` | Put a document inside a node or arrow | writes |
| `detach_document` | Detach the document from a node or arrow | writes |
| `import_github_repository` | Draw a GitHub repository as a project | writes |
| `get_embed_snippet` | Get the embed snippet of a public whiteboard | reads |

Text is edited by block: `read_text_document` returns each top-level block with a stable id, and the editing tools name the block they mean. Nothing is addressed by position or by matching text, so an edit made against a read that is a second old still lands where it was meant to.

`scripts/mcp/client.mjs` calls one tool from the command line, and `scripts/mcp/smoke.mjs` drives every tool as three people and checks the results. Both sign in with a password, against a local stack.

### Not exposed yet

Members and invites, billing, creating an org, and the consent screen itself have no tools. The reasons are beside the list in `src/lib/mcp/parity.test.ts`, which fails when a server action is added without either a tool or an entry in that list.

## Security model

In plain words: **the agent is you, and the database decides what you may do.**

- **The token is the person's own.** Supabase Auth issues an MCP client the same kind of JWT it issues a browser, for the person who approved it. The server checks its signature against the project's published keys, its issuer, its audience, and that it belongs to a signed-in person.
- **Every tool call uses a Supabase client that carries that token.** Row-level security then decides what can be read and written, exactly as it does for the web app. A viewer's agent can read and cannot write. An agent cannot see an org its person is not in; to it, those things do not exist.
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
