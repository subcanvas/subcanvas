# Subcanvas — Requirements (v1)

An open-source Notion/Excalidraw hybrid. Teams build whiteboards and pages that nest inside each other: a box on a high-level architecture diagram opens that service's own whiteboard, and an arrow between two services opens a page describing the protocol between them.

**Stack:** Next.js (App Router) on Vercel · Supabase (Auth, Postgres, Realtime, Storage) · Stripe · React Flow · BlockNote · shadcn/ui · Yjs

Status legend: requirements are v1 unless marked **(later)**.

## Glossary

The words the product uses, in the interface, in the MCP tools' descriptions, and in these docs: one word for each thing, and each word for one thing. Where code, the data model, or a tool's name uses an older word, it is given in the last column; tool names are kept as they are so that agents' setups keep working.

| Word | What it means | In code and tool names |
|---|---|---|
| **Workspace** | Where projects live, with the people in it and its plan. Everyone has a personal workspace, theirs alone; a team workspace is shared with the people invited to it. Not "org" or "organization". | `orgs`, `org_id`, the `[org]` route; the tools say `workspace_id` |
| **Document** | Anything in a project's tree: a whiteboard or a page. | `documents` |
| **Whiteboard** | A document to draw on: nodes and arrows on a canvas (its drawing surface). | `type: whiteboard` |
| **Page** | A document of rich text. Not "text doc" or "note". | a text document, `type: text` (`read_text_document`) |
| **Diagram** | What is drawn on a whiteboard, seen as a picture of something: "a repository becomes a diagram". The document is always a whiteboard. | |
| **Node** | Anything on a whiteboard except an arrow: a box, a text node, a group, a picture or a video. | node |
| **Box** | A node with an outline and a title inside it; the toolbar's Box. It can take a shape. Not "plain node". | kind `plain` |
| **Text node** | A heading with **body text** under it and no outline; the toolbar's Text. | kind `text`; the body text is the node's `description` field |
| **Group** | A frame that holds nodes and moves them together. | kind `group` |
| **Picture**, **video** | A file shown on a whiteboard or in a page. Not "image" or "photo". **Media** is the word for both together, only where one word must do: the toolbar's Media button. | kind `media` |
| **Arrow** | What joins two nodes. Not "edge" or "connection" (except as a `.subcanvas` file's `connects`). | edge, `edges`, `update_edges` |
| **Object** | A node or an arrow: anything on a whiteboard that can hold a document. Said only where either is meant. | `object_id` |
| **Description** | The page that belongs to a node or an arrow: it opens in the side panel, is not listed in the project tree, and does not count toward the private-document limit. Not "notes" or "node description". | a document of `kind: description` |
| **Link** | A way to a document that lives elsewhere: a node or arrow that opens it, or a document link card in a page. What links to a document is listed as **Linked from**. Not "reference" or "Referenced by". | `document_links`, `list_references` |

---

## 1. Ontology

| ID | Requirement |
|---|---|
| R1.1 | Hierarchy: **Workspace → Project → Folder → Document**. Folders can nest. |
| R1.2 | A **Document** is the core entity and has exactly one type: **Whiteboard** (React Flow) or **Page** (BlockNote). |
| R1.3 | Documents nest to any depth, in any combination: whiteboard in page, page in page, whiteboard in whiteboard, page in whiteboard. |
| R1.4 | Every document has **exactly one parent** (its home): a folder, another document, or a node or arrow on a whiteboard. This defines its canonical location in the tree. |
| R1.5 | A document can additionally be **linked from many places**. A link points at an existing document, not a copy; edits are visible everywhere it is linked. |
| R1.6 | When attaching a document to anything, the user can either **create a new document** (that location becomes its parent) or **link an existing document**. |
| R1.7 | A document shows a **"Linked from"** list of every place that links to it. |
| R1.8 | Deleting a document that has links to it warns the user and lists them. Deleting a link never deletes the document. |
| R1.9 | Cycles are allowed through links (A links to B links to A) but not through parentage. |
| R1.10 | Deleting means one thing inside a project: a folder or a document goes to the project's **trash** with everything inside it, and so does what a deleted node or arrow held (R4.1, R4.2). From the trash it is restored where it was, or deleted forever. A project or a workspace is deleted permanently, after its name is typed. |

## 2. Navigation

| ID | Requirement |
|---|---|
| R2.1 | A **breadcrumb** shows the path the user navigated to reach the current document, from the root down. Each crumb is clickable. |
| R2.2 | When a document is reached through a link, the breadcrumb shows the navigated path, not the canonical one. The canonical location is available from the document's menu ("Show in tree"). |
| R2.3 | The navigated path is encoded in the URL so breadcrumbs survive reload and links are shareable. Opening a document by its bare URL falls back to the canonical path. |
| R2.4 | A left sidebar shows the project tree: folders, documents, and nested documents under their parent. |
| R2.5 | Pages show child documents and links to other documents inline, as a card (a custom BlockNote block) that shows the document's title and type and opens it on click. |

## 3. Whiteboard objects

An **object** is a node or an arrow. Groups contain nodes.

### Nodes
| ID | Requirement |
|---|---|
| R3.1 | **Box:** an outline with the title inside it. Configurable color. Resizable. |
| R3.2 | **Text node:** no outline. Floats freely and shows a heading with body text beneath it. Configurable text color. |
| R3.3 | **Shapes and badges.** A box is a rectangle, rounded rectangle, ellipse, diamond, hexagon, cylinder, parallelogram, document, or cloud; a box that nobody has resized takes the size of each new shape. Any node, and an arrow's label, can carry an icon (from a curated set of Lucide icons) and an emoji as badges. |
| R3.3a | **Pictures and videos:** a node that shows a file (PNG, JPEG, WebP, GIF, AVIF up to 10 MB; MP4, WebM, MOV up to 100 MB), keeps the file's proportions when resized, and has a caption and alt text. Files are added from the toolbar, dropped on the canvas, or pasted. |

### Arrows
| ID | Requirement |
|---|---|
| R3.4 | Path shape: **spline** or **step** (straight segments with 90° corners). |
| R3.5 | Stroke style: **solid** or **dotted**, independent of path shape. |
| R3.6 | Direction: **none**, **forward**, **reverse**, or **both**. |
| R3.7 | Configurable color. |
| R3.8 | Optional text **label** displayed on the arrow. |

### Groups
| ID | Requirement |
|---|---|
| R3.9 | A group is a container node. Dragging it moves everything inside it. |
| R3.10 | Nodes, other groups included, can be placed inside a group. Groups nest to any depth. |
| R3.11 | Nodes can be dragged into and out of a group. |
| R3.12 | A group has connection handles on its boundary so arrows can attach to it from other groups or standalone nodes. |
| R3.13 | Configurable color and an optional title in the top-left corner. Resizable. |

### Canvas
| ID | Requirement |
|---|---|
| R3.14 | Create, delete, move, resize, connect, multi-select, copy/paste, undo/redo, pan, and zoom. |
| R3.14a | Deleting an object sends what it held to the trash (R1.10); undo brings the object back with it. A picture's or video's file is deleted once nothing shows it and the deletion can no longer be undone. On a touch screen an object is deleted from its side panel. |
| R3.15 | A toolbar for adding boxes, text nodes, groups, and pictures and videos. |

## 4. What objects hold, and the side panel

| ID | Requirement |
|---|---|
| R4.1 | Every node and arrow can hold **one document** of either type: one of its own, or a link to one that lives elsewhere. |
| R4.2 | Every node and arrow can have a **description**: a page parented to it. It is created on first edit, not when the node or arrow is created. |
| R4.3 | **Single click** on an object selects it and opens a **side panel** from the right. |
| R4.4 | The side panel shows the object's settings (title, color, and for arrows: line, stroke, direction, label) and the document it holds. |
| R4.5 | A **page** it holds is fully editable inside the side panel, with no navigation. |
| R4.6 | A **whiteboard** it holds shows as a preview card in the side panel with an Open button. |
| R4.7 | **Double click**, or the open icon on the object, navigates into the document it holds and extends the breadcrumb. |
| R4.8 | Each object has an **open mode** setting for a page it holds: *side panel* (default) or *full page*. In full-page mode, double click opens the page on its own. Whiteboards always navigate. |
| R4.9 | Objects that hold a document show a visual indicator on the canvas. |
| R4.10 | The side panel lets the user attach a new document, link an existing one (R1.6), change it, or detach it. |

## 5. Real-time collaboration

| ID | Requirement |
|---|---|
| R5.1 | Multiple users can edit the same whiteboard or page at the same time, with changes merged without conflicts (Yjs CRDTs). |
| R5.1a | Yjs updates travel over **Supabase Realtime** broadcast channels. No separate WebSocket server. |
| R5.2 | Presence among editors: live cursors on whiteboards, carets and selections in pages, and avatars of who is editing. |
| R5.3 | Document state persists to Postgres. A user who opens a document alone gets the latest state. |
| R5.4 | Edits made in the side panel and on the standalone page of the same document stay in sync. |
| R5.5 | Viewers cannot edit. They hold no real-time connection: the document refreshes itself every 20 seconds or so, which keeps free and anonymous viewing nearly free to serve. |
| R5.6 | Everyone sees how many people are watching a document without editing, including anonymous viewers of a public project. The count may lag by a few seconds. |

## 6. Workspaces, roles, and sharing

| ID | Requirement |
|---|---|
| R6.1 | Auth through Supabase: **email and password** (with reset by email), **email magic link**, **Google**, and **GitHub**. Anyone signed in can set a password later, whichever way they signed up. |
| R6.2 | Every account has a **personal workspace**, made with it and named after its person. It is theirs alone: nobody else joins it or is invited to it, it cannot be left, and it is deleted only with the account. A user can also create **team workspaces**, belong to several, and switch between them; the switcher lists the personal workspace first. Signing in opens the personal workspace. |
| R6.3 | Roles per workspace: **Owner** (billing, delete the workspace, everything below), **Admin** (members, projects), **Editor** (create and edit content), **Viewer** (read only). |
| R6.4 | Members are invited to a team workspace by email with a role. |
| R6.5 | All data access is enforced by Postgres row-level security scoped to workspace membership and role. |
| R6.6 | A project is **private** (members only, the default) or **public** (anyone with the link can read every document in it; nobody outside the workspace can edit). Only admins and owners make a project public, whether when creating it (including by a GitHub import or an agent) or later, and change it back, behind a confirmation that says plainly what public means. Editors create private projects. Public pages are not indexed by search engines unless the workspace opts in **(opt-in later)**. |
| R6.7 | Public pages carry a way to report abuse, and the operator can take a project down. |
| R6.8 | A person deletes their own account from Profile, typing its email to confirm. That deletes their personal workspace and every team workspace nobody else is in, with everything in them, pictures and videos included, then the account. Team workspaces other people are still in keep what they made there. It is refused, naming the workspace and what to do, while they are the only owner of a team workspace with other members, or while a workspace it would delete has a running subscription. |

## 7. Plans and billing

| ID | Requirement |
|---|---|
| R7.1 | **Free plan:** unlimited documents in **public** projects, up to **100 documents across private projects**, and up to **3 editors**. Viewers are unlimited. |
| R7.1a | Descriptions (R4.2) and what is in the trash, including everything inside a trashed document or folder, do not count toward the private document limit. Restoring counts everything that comes back. |
| R7.2 | **Paid plan, Pro:** $5 per editor per month through Stripe, billed per workspace, personal or team (a personal workspace has one editor). Unlimited private documents and editors. |
| R7.2a | Editors are Owners, Admins, and Editors. Viewers are always free and never billed. |
| R7.3 | Stripe Checkout to subscribe, Stripe Customer Portal to manage, and webhooks that sync subscription state to Supabase. |
| R7.4 | The billed quantity follows the number of editors as members are added, removed, or change to or from Viewer. |
| R7.5 | At a limit, the blocked action (a new private document, a restore, an import, a fourth editor, making a project private) says the same thing wherever it happens: what the limit is, then, where the server sells a plan, the upgrade for an owner, or a line telling anyone else to ask an owner. Everything that exists stays editable. An admin can always make a project public; making it private is checked against the limit. |
| R7.6 | When a subscription lapses nothing is deleted and **nothing is ever made public**. A workspace left with more editors than the free plan includes has a 14-day grace period, then becomes read-only for everyone except owners until it resubscribes or moves editors to viewers. |
| R7.7 | Limits are a deployment setting and are **off by default**, so a self-hosted server has no limits and needs no billing setup. With Stripe unconfigured, billing navigation and upgrade prompts are hidden. |

## 8. Platform

| ID | Requirement |
|---|---|
| R8.1 | shadcn/ui components wherever one fits: sidebar, breadcrumb, sheet, popover, dialog, dropdown, and so on. |
| R8.2 | Pictures and videos, in pages and on whiteboards, are uploaded to Supabase Storage. |
| R8.3 | Light and dark themes. |
| R8.4 | **Minimal Vercel dependence:** Vercel only hosts the Next.js app. No Vercel-specific services (KV, Blob, Postgres, Cron, Edge Config). The app must run on any Node host or container. State, auth, realtime, storage, and scheduled jobs all live in Supabase. |
| R8.4a | Open source under the AGPL-3.0 license, with a documented self-hosting path (own Supabase project and Vercel deployment). |
| R8.5 | Search across document titles and content **(later)**. |
| R8.6 | Export: a page as Markdown, a whiteboard as SVG, and a whole project as a zip whose pages Import files brings back ([docs/EXPORTING.md](docs/EXPORTING.md)). Anyone who can read a document can export it. A whiteboard as PNG **(later)**. |
