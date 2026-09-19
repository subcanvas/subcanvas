# Subcanvas: Roadmap

What comes after v1 ([REQUIREMENTS.md](../REQUIREMENTS.md)). Nothing here is built yet. Each section says what we want, what it takes, and what is still undecided. Where a question is open, a recommendation is given so there is something concrete to agree or disagree with.

| | Item | Size | Why |
|---|---|---|---|
| 1 | [Linked documents](#1-linked-documents-google-slack-anything-with-a-url): a node opens a Google Doc or a Slack canvas instead of a Subcanvas document | Small | Teams already have their docs somewhere. Nobody should have to move them to draw the map. |
| 2 | [Full-access MCP server](#2-full-access-mcp-server) | Medium | Nothing a human can do that an agent cannot. |
| 3 | [GitHub integration](#3-github-integration): connect a repository, get its system diagram | Large | The big one. It shows a developer what the product is within a minute of signing up. |

Items 2 and 3 both need the same two pieces first, described under [Shared foundation](#shared-foundation).

---

## 1. Linked documents (Google, Slack, anything with a URL)

**What.** Today, what is inside a node, edge, or group is a Subcanvas document: a whiteboard or a page of text. Add a third option: **a link to a document that lives elsewhere**. The node on the diagram is ours; the page behind it is the team's existing Google Doc, Slack canvas, Notion page, or Figma file.

**How it works.**

- When attaching something to an object, the choices become: new whiteboard, new page, link an existing Subcanvas document, **link something external**. The user pastes a URL.
- The node shows the provider's icon and the document's title. Opening it shows the document in the side panel where the provider allows embedding (Google Docs does, for people who have access to the doc) and opens a new tab where it does not (Slack).
- Subcanvas never copies the content and never decides who can read it. The provider's own permissions apply: a viewer of a public project who has no access to the Google Doc sees Google's "request access" page.

**Stages.**

1. **Any URL.** A new document type, `link`, holding a URL, a title, and a detected provider. No OAuth. This covers Google, Slack, and everything else on day one.
2. **Connected accounts** (Google first, then Slack). Pick a file from a picker instead of pasting, keep titles in sync, and warn when a linked document has been deleted or the viewer cannot open it.

**Open questions.**

| Question | Recommendation |
|---|---|
| Do linked documents count toward the free plan's private document limit? | No. They hold no content and cost nothing to store. |
| Should linked documents appear in the project tree? | Yes, with the provider's icon, so the tree stays a complete list of what the project contains. |
| Search inside linked documents (when search exists, R8.5)? | Titles only. Content search means copying content, which stage 1 avoids on purpose. |

---

## 2. Full-access MCP server

**Principle: nothing a human can do that an agent cannot.** An agent connected to Subcanvas over the [Model Context Protocol](https://modelcontextprotocol.io) can read and change everything its user can, with the same permissions and the same limits.

**What that means in practice.**

- **It acts as a user, never as an admin.** The agent signs in through OAuth as a person and gets that person's role in each org. Row-level security stays the one place access is decided, exactly as for the web app. There is no service key behind the MCP server and no separate permission model to keep in step.
- **The tool list is the feature list.** Orgs and members (list, invite, change role, remove). Projects (create, rename, make public or private, delete). Folders and documents (create, move, rename, trash, restore, link, list references). Whiteboards (add, move, restyle, connect, group, and delete nodes, edges, and groups; open what is inside them). Text (read as Markdown, insert, replace, delete blocks). Billing (read the plan; return a checkout or portal link, since paying is the one step that needs a human and a card).
- **Agents are collaborators, not importers.** An agent's edits go through the same Yjs documents as a person's, so people watching see them arrive live, undo works, and the agent shows up in presence under a name like "Trevin's agent".
- **Parity is tested, not promised.** A feature is not done until its tool exists. A test lists every server action and fails when one has no matching tool.

**Transport and hosting.** A remote server at `subcanvas.app/mcp` (streamable HTTP, OAuth 2.1 per the MCP specification), so it works from Claude, ChatGPT, Cursor, and anything else that speaks MCP without installing anything. Self-hosters get the same endpoint from their own deployment.

**Open questions.**

| Question | Recommendation |
|---|---|
| Should destructive tools (delete a project, remove a member) ask for confirmation? | No special case. The web app sends documents to the trash instead of destroying them, and the agent gets the same safety net. Mark the tools as destructive in their MCP annotations so clients can ask their user. |
| Can a user limit an agent to one project or to read-only? | Yes, at connection time: the OAuth consent screen offers "everything I can do" (the default), "read only", and "only these projects". |
| Are agents billed as editors? | No. An agent acts as its user, who is already counted. |
| Rate limits? | Per user, shared between the web app and agents, so an agent cannot do more damage than a script in the browser could. |

---

## 3. GitHub integration

**What.** A **Developers** tab on the home page. Connect a repository and Subcanvas draws its system diagram: **one node per folder**, each node's document is that folder's `README.md`, and folders inside folders become whiteboards inside nodes. This is the product's own idea (a box on the architecture diagram opens that service's own diagram) filled in from what the repository already says about itself. A free-tier user sees it working on their own code before they have drawn anything.

**The model.**

- A node that comes from a repository carries its **folder path**, shown next to its title (`Payments` · `services/payments`). The path is the node's identity: rename the node freely, and it still follows the folder.
- The node's document is the folder's `README.md`, shown read-only with an "Edit on GitHub" link. A folder with no README gets a node with no document.
- A folder that contains other mapped folders opens into its own whiteboard. Depth in the repository is depth in Subcanvas.
- **The repository owns** which folders exist, their READMEs, and the connections declared in `.subcanvas` files. **Subcanvas owns** where nodes sit, their colors, their titles, and anything the user adds by hand: extra nodes, extra edges, notes. A sync never moves or restyles anything, and never touches what the user added.

**`.subcanvas` files.** An optional file in any folder that says what the folder is and what it talks to. Proposed format (YAML):

```yaml
# services/payments/.subcanvas
title: Payments
description: Charges cards and reconciles payouts.
connects:
  - to: services/ledger          # a path from the repository root
    label: gRPC
    description: Posts a journal entry for every settled charge.
  - to: services/notifications
    label: events
ignore:
  - fixtures                     # subfolders that are not part of the design
```

`connects` becomes edges, and an edge's `description` becomes the edge's document, which is the second half of the product's pitch (click an arrow, read the protocol). A folder with a `.subcanvas` file is always mapped, which also makes the file the way to include a folder the automatic pass skipped.

**Sync.** A GitHub App with read-only access to contents and metadata. On first connect, and on every push to the default branch: new folders appear (placed near their parent, flagged as new), deleted folders are flagged as gone rather than silently removed, READMEs refresh, declared edges are reconciled. Sync writes into the whiteboard's Yjs state from the server, so anyone with the diagram open sees the change arrive.

**Open questions.** These are the ones that decide what gets built.

| Question | Recommendation |
|---|---|
| Are nodes created automatically, or does the user link folders by hand? | **Both, automatic first.** The first import maps folders automatically, because a full diagram in the first minute is the whole point for a new user. The user then deletes what is not part of the design, and deleted paths are remembered so a later sync does not bring them back. Any node, including one drawn by hand, can also be linked to a folder from its inspector. |
| Which folders does the automatic pass map? | Not every folder has design relevance. Map a folder when it has a `README.md` or a `.subcanvas` file, or is a direct child of a conventional root (`services/`, `apps/`, `packages/`, `cmd/`, `internal/`). Skip dot-folders, dependencies, and build output (`node_modules`, `dist`, `vendor`, `target`). Cap the first pass at two levels deep and offer "map the folders inside" on any node. The heuristic will be wrong sometimes; deleting is one click, and that is the fix. |
| Does Subcanvas open pull requests that add `.subcanvas` files? | **Not at first, then opt-in.** Reading is enough to demonstrate the idea, and asking for write access on first connect will cost sign-ups. Later: when a user draws an edge between two repository nodes, offer "save this to the repository", which opens a pull request. That needs a second, separate permission grant, requested only at that moment. |
| When a user edits a README in Subcanvas, where does the edit go? | Nowhere: READMEs are read-only here. Notes that belong to the diagram and not the repository go in a separate Subcanvas document on the same node. |
| How are new nodes laid out? | Automatic layout (ELK) on the first import only. After that, a sync places new nodes beside their parent and never moves existing ones. |
| Private repositories and the free plan? | A public repository makes a public project, which is free and unlimited, consistent with R7. A private repository makes a private project and its READMEs count toward the private document limit like any other document. |
| One repository per project, or many? | One repository per project to start. Multi-repository systems are real and common, so the data model should not rule them out: store the repository on the node's source, not on the project. |
| Monorepos with hundreds of packages? | The two-level cap and the conventional-roots rule handle the first import. Beyond that, the user maps further by hand. |
| Branches other than the default? | Default branch only. A pull-request preview ("this PR adds a service and two connections") is a strong later feature and needs nothing new in the model. |
| A try-it box on the landing page: paste a public repository URL, see its diagram with no account? | Yes, once import works. It is the shortest possible demonstration. It needs rate limiting and a cache, and no GitHub App, since public repositories can be read anonymously. |
| GitLab and Bitbucket? | Keep provider-specific code behind one interface (list folders, read a file, receive a push). Do not build a second provider until someone asks. |

---

## Shared foundation

Two pieces that items 2 and 3 both need, and that are worth building once and first.

1. **A server-side document writer.** Today only a browser writes to a document's Yjs state. An agent's edits and a repository sync both have to write from the server: load the document, apply a change as a Yjs update, persist it, and broadcast it to everyone who has the document open. It must respect the same permission checks as a browser client.
2. **A source on documents and objects.** A record of where something came from and what keeps it current: `{ provider: "github", repository, path, ref }` for a repository node, `{ provider: "google", url }` for a linked document. It is what makes a document read-only, what a sync matches on, and what the interface shows next to the title.

## Suggested order

1. **Linked documents, stage 1.** Small, independent, useful on its own, and it introduces the source field.
2. **Server-side document writer.**
3. **GitHub import, read-only:** Developers tab, automatic mapping, README documents, delete-to-prune. This is the demonstration, and it ships without `.subcanvas` support.
4. **MCP server.** By now the writer exists and the hard part is breadth, not depth.
5. **`.subcanvas` files and push sync.**
6. **Pull requests from Subcanvas, connected Google and Slack accounts, the landing-page try-it box.**

The MCP server could trade places with GitHub import. GitHub import is ahead because it is what brings people in; the MCP server is what makes the product more useful to the people already there.
