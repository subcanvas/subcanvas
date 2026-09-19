# Graph Notes — Requirements (v1)

An open-source Notion/Excalidraw hybrid. Teams build nested whiteboards and text documents: a node on a high-level architecture diagram opens that service's own diagram, and an edge between two services opens a text doc describing the protocol between them.

**Stack:** Next.js (App Router) on Vercel · Supabase (Auth, Postgres, Realtime, Storage) · Stripe · React Flow · BlockNote · shadcn/ui · Yjs

Status legend: requirements are v1 unless marked **(later)**.

---

## 1. Ontology

| ID | Requirement |
|---|---|
| R1.1 | Hierarchy: **Org → Project → Folder → Document**. Folders can nest. |
| R1.2 | A **Document** is the core entity and has exactly one type: **Whiteboard** (React Flow) or **Text doc** (BlockNote). |
| R1.3 | Documents nest to any depth, in any combination: whiteboard in text doc, text doc in text doc, whiteboard in whiteboard, text doc in whiteboard. |
| R1.4 | Every document has **exactly one parent** (its home): a folder, another document, or a whiteboard object inside another document. This defines its canonical location in the tree. |
| R1.5 | A document can additionally be **referenced from many places**. A reference is a link to an existing document, not a copy; edits are visible everywhere it is referenced. |
| R1.6 | When attaching a document to anything, the user can either **create a new document** (that location becomes its parent) or **link an existing document** (creates a reference). |
| R1.7 | A document shows a **"Referenced by"** list of every place that links to it. |
| R1.8 | Deleting a document that has references warns the user and lists the references. Deleting a reference never deletes the document. |
| R1.9 | Cycles are allowed through references (A references B references A) but not through parentage. |

## 2. Navigation

| ID | Requirement |
|---|---|
| R2.1 | A **breadcrumb** shows the path the user navigated to reach the current document, from the root down. Each crumb is clickable. |
| R2.2 | When a document is reached through a reference, the breadcrumb shows the navigated path, not the canonical one. The canonical location is available from the document's menu ("Show in tree"). |
| R2.3 | The navigated path is encoded in the URL so breadcrumbs survive reload and links are shareable. Opening a document by its bare URL falls back to the canonical path. |
| R2.4 | A left sidebar shows the project tree: folders, documents, and nested documents under their parent. |
| R2.5 | Text docs embed child documents inline through a custom BlockNote block that shows the child's title and type and navigates on click. |

## 3. Whiteboard objects

An **object** is a node or an edge. Groups contain objects.

### Nodes
| ID | Requirement |
|---|---|
| R3.1 | **Plain node:** a rectangle with the title inside it. Configurable color. Resizable. |
| R3.2 | **Text node:** no bounding box. Floats freely and shows a title with a description paragraph beneath it. Configurable text color. |
| R3.3 | Other node shapes and icons **(later)**. |

### Edges
| ID | Requirement |
|---|---|
| R3.4 | Path shape: **spline** or **step** (straight segments with 90° corners). |
| R3.5 | Stroke style: **solid** or **dotted**, independent of path shape. |
| R3.6 | Direction: **none**, **forward**, **reverse**, or **both**. |
| R3.7 | Configurable color. |
| R3.8 | Optional text **label** displayed on the edge. |

### Groups
| ID | Requirement |
|---|---|
| R3.9 | A group is a container node. Dragging it moves everything inside it. |
| R3.10 | Nodes, edges, and other groups can be placed inside a group. Groups nest to any depth. |
| R3.11 | Objects can be dragged into and out of a group. |
| R3.12 | A group has connection handles on its boundary so edges can attach to it from other groups or standalone nodes. |
| R3.13 | Configurable color and an optional title in the top-left corner. Resizable. |

### Canvas
| ID | Requirement |
|---|---|
| R3.14 | Create, delete, move, resize, connect, multi-select, copy/paste, undo/redo, pan, and zoom. |
| R3.15 | A toolbar for adding plain nodes, text nodes, and groups. |

## 4. Object documents and the side panel

| ID | Requirement |
|---|---|
| R4.1 | Every node, edge, and group can hold a reference to **one document** of either type. |
| R4.2 | Every node has a **default description** that is a full text Document, parented to that node. It is created on first edit, not when the node is created. |
| R4.3 | **Single click** on an object selects it and opens a **side panel** from the right. |
| R4.4 | The side panel shows the object's settings (title, color, and for edges: shape, stroke, direction, label) and its linked document. |
| R4.5 | A linked **text doc** is fully editable inside the side panel, with no navigation. |
| R4.6 | A linked **whiteboard** shows as a preview card in the side panel with an Open button. |
| R4.7 | **Double click**, or the open icon on the object, navigates into the linked document and extends the breadcrumb. |
| R4.8 | Each object has an **open mode** setting for its text doc: *side panel* (default) or *navigate*. In navigate mode, double click opens the text doc as a standalone page. Whiteboards always navigate. |
| R4.9 | Objects with a linked document show a visual indicator on the canvas. |
| R4.10 | The side panel lets the user attach a new document, link an existing one (R1.6), change it, or detach it. |

## 5. Real-time collaboration

| ID | Requirement |
|---|---|
| R5.1 | Multiple users can edit the same whiteboard or text doc at the same time, with changes merged without conflicts (Yjs CRDTs). |
| R5.1a | Yjs updates travel over **Supabase Realtime** broadcast channels. No separate WebSocket server. |
| R5.2 | Presence: live cursors on whiteboards, carets and selections in text docs, and avatars of who is in the document. |
| R5.3 | Document state persists to Postgres. A user who opens a document alone gets the latest state. |
| R5.4 | Edits made in the side panel and on the standalone page of the same document stay in sync. |
| R5.5 | Viewers receive live updates but cannot edit. |

## 6. Orgs, roles, and sharing

| ID | Requirement |
|---|---|
| R6.1 | Auth through Supabase: **email magic link**, **Google**, and **GitHub**. |
| R6.2 | A user can belong to several orgs and switch between them. |
| R6.3 | Roles per org: **Owner** (billing, delete org, everything below), **Admin** (members, projects), **Editor** (create and edit content), **Viewer** (read only). |
| R6.4 | Members are invited by email with a role. |
| R6.5 | All data access is enforced by Postgres row-level security scoped to org membership and role. |
| R6.6 | Public read-only share links **(later)**. |

## 7. Billing

| ID | Requirement |
|---|---|
| R7.1 | **Free tier:** up to **25 documents** per org. Members and viewers are unlimited, so free orgs can spread by invitation. |
| R7.1a | Node description documents (R4.2) **do not count** toward the limit. Only documents a user creates explicitly count. |
| R7.2 | **Paid tier:** $5 per seat per month through Stripe, billed at the org level. Unlimited documents. |
| R7.2a | Billed seats are **Owners, Admins, and Editors**. Viewers are always free. |
| R7.3 | Stripe Checkout to subscribe, Stripe Customer Portal to manage, and webhooks that sync subscription state to Supabase. |
| R7.4 | Seat count updates when billed members are added, removed, or change to or from Viewer. |
| R7.5 | When a free org hits the limit, creating documents is blocked with an upgrade prompt. Existing documents stay editable. |
| R7.6 | When a subscription lapses, content stays readable and exportable. Nothing is deleted. |

## 8. Platform

| ID | Requirement |
|---|---|
| R8.1 | shadcn/ui components wherever one fits: sidebar, breadcrumb, sheet, popover, dialog, dropdown, and so on. |
| R8.2 | Image uploads in text docs go to Supabase Storage. |
| R8.3 | Light and dark themes. |
| R8.4 | **Minimal Vercel dependence:** Vercel only hosts the Next.js app. No Vercel-specific services (KV, Blob, Postgres, Cron, Edge Config). The app must run on any Node host or container. State, auth, realtime, storage, and scheduled jobs all live in Supabase. |
| R8.4a | Open source under the AGPL-3.0 license, with a documented self-hosting path (own Supabase project and Vercel deployment). |
| R8.5 | Search across document titles and content **(later)**. |
| R8.6 | Export (whiteboard to PNG/SVG, text doc to Markdown) **(later)**. |
