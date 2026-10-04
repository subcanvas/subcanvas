---
description: Draws and edits Subcanvas whiteboards through the Subcanvas MCP tools so that people can read them, with boxes that open into their own whiteboards and arrows that carry a short label and a page saying why they exist. Use whenever you read or change anything in Subcanvas, or are asked to diagram, map, or explain a repository, a system, a pull request, or a document as a whiteboard.
---

# Drawing in Subcanvas

Subcanvas is a whiteboard where any box or arrow can hold a page, or a whole whiteboard of its own. A good Subcanvas diagram is shallow on each level and deep where it matters: a handful of boxes on top, each opening into the detail behind it. The tools named here are the Subcanvas MCP server's; if they are not loaded, look them up by name (for example `read_whiteboard`) before you start.

## The words

- **Workspace**: where projects live. **Project**: a tree of folders, whiteboards, and pages.
- **Whiteboard**: a document to draw on. **Page**: a document of rich text; the tools call it a text document, type `text`.
- **Box**: a node of kind `plain`, with an outline and a title. **Text node**: kind `text`, a heading with body text under it and no outline. **Group**: kind `group`, a titled frame that holds nodes and moves them together.
- **Arrow**: what joins two nodes; the tools call arrows `edges`.
- **Description**: the page that belongs to a box or an arrow and opens beside the whiteboard.

## Read before you write

1. Find the place. `list_workspaces` (your role in each: a viewer can only read), then `list_projects`, then `get_project` for the tree. Everything is addressed by id. A Subcanvas address ends in `/d/<id>`, and that id is the document's.
2. Read what is there. `read_whiteboard` before changing a whiteboard, and `read_text_document` before changing a page. A node that holds a whiteboard has `doc_type: whiteboard` and its `doc_id`; read that too when the change reaches inside it.
3. Change what exists rather than adding beside it. If a box for the thing is already there, update it with `update_nodes`; do not draw a second one.

People may be editing the same whiteboard while you work. Your edits merge with theirs, so change only what you mean to: update fields in place, and address a page's text by block id (`insert_after_block`, `append_markdown`), not by rewriting it.

## Box, text node, or group

- **A box** for each thing the diagram is about: a service, a package, a database, a person, a step. Things that arrows connect are boxes. Shapes carry meaning by convention: `cylinder` for a database, `diamond` for a decision, `cloud` for something hosted elsewhere, `document` for a file, `hexagon` or `parallelogram` for a process or its input. Otherwise leave the default rectangle.
- **A text node** for words that explain the whiteboard rather than take part in it: a title and a sentence or two at the top, a legend, a note beside a tricky part. Its body text goes in `description` (text nodes only).
- **A group** for a boundary around boxes that belong on this whiteboard together: one deployment, one team, one cloud account, one layer. Draw the boxes first, then `create_group` with their `node_ids`. If the boxes in a would-be group are really the inside of one thing, that thing is a box with a whiteboard inside it, not a group.

Use color sparingly and for meaning, one color per kind of thing, and say what the colors mean in a text node when it is not obvious.

## Nest: put detail inside, not beside

A box opens into its own whiteboard. When a box has parts worth drawing, `attach_document` with `type: "whiteboard"` on that box, then draw the parts on the new whiteboard (its id is the `document_id` in the result). Do not crowd the parts around the box on the level above. Aim for about a dozen boxes or fewer on each whiteboard; when there are more, find the boxes that are parts of one thing and move them a level down.

When a box or an arrow needs explaining but has no parts to draw, give it a page instead: `attach_document` with `type: "text"` and the `markdown`. Write what it is, what it is responsible for, and anything a reader would ask. A box or an arrow holds one document; `detach_document` first to replace it.

On the free plan a nested whiteboard counts toward the workspace's private documents and a description does not. If a nested whiteboard is refused for a plan limit, say so to the person and use a description for that detail instead.

## Arrows

- `connect_nodes` with the ids `add_nodes` returned. The arrow points from `source` to `target`; pick one meaning per whiteboard (who calls whom, or where data goes) and keep to it. `direction: "both"` for a real two-way exchange, `stroke: "dotted"` for something asynchronous or optional, and say so in a legend if you use it.
- Label every arrow with a few words: the protocol or the verb ("HTTPS", "reads", "publishes events"). A label holds at most 120 characters; keep it to about three words.
- Put a page behind each arrow that matters (`attach_document` on the arrow's id, `type: "text"`), saying why the arrow exists: what crosses it, in which format, who starts it, and what happens when it fails. The label is the name; the page is the explanation.

## Titles and words

Titles are short: a box's title is its name, a few words, about 30 characters or fewer, and never a sentence. The limits, from the app, are 200 characters for a title (a box, a text node's heading, a group), 2,000 for a text node's body text, and 120 for an arrow's label. Anything longer than a name goes in a page. Use the names the code or the people use, so a reader can search for them.

## Lay it out

Build a diagram in this order: `add_nodes` with the boxes at once (leave out x and y), `connect_nodes`, then `arrange_nodes`, which lays the nodes out left to right along the arrows and puts every node no arrow joins in a grid underneath. So add a title or a legend after arranging, with x and y that place it where it belongs (a title above the diagram has a y less than the top box's). Arrange each nested whiteboard after drawing it, and the inside of a group with `group_id`.

`arrange_nodes` moves every node on the level it lays out and overwrites positions people chose by hand. Use it on a whiteboard you drew, or when asked. When you add a few nodes to a whiteboard someone laid out, pass `near_node_id` to `add_nodes` instead, and leave everything else where it is.

## Never delete what a person made without asking

`delete_nodes`, `delete_edges`, `trash_document`, `replace_block`, `delete_block`, and `arrange_nodes` change or remove other people's work. Before using them on anything you did not create in this conversation, say what you would remove or move and why, and wait for a yes.

- Deleted nodes and arrows are not kept anywhere, and a person's undo does not reach your edits. What they held goes to the trash, and the result names it.
- Before trashing a document, `list_references` shows what links to it.
- `delete_document_forever` only when the person asked for exactly that.
- Ask before `set_project_visibility` makes anything public.

## Linking to code

When a box or an arrow stands for code, say where the code is. Set `code_url` on the box or arrow (in `add_nodes`, `update_nodes`, `connect_nodes`, or `update_edges`) to the address of that file or folder, so a click opens the code; a line range like `#L10-L20` works on GitHub, GitLab and Bitbucket. Name the file or folder in its page, as a link to it on the repository's host when you know the address. A box drawn by the GitHub import already links to its folder: `read_whiteboard` gives its `repository_path` and a `code_url` marked `code_url_from_folder`; set your own `code_url` only to point somewhere more specific. Keep those boxes and their pages; they are the import's.

## Repositories

- A public GitHub repository can become a project in one step with `import_github_repository`: a box for each main folder, a whiteboard inside each folder that has folders of its own, every README as a page, and arrows from its `.subcanvas` files. It is a one-time copy that makes a new project. Build on it with the tools above.
- Any other repository is drawn by hand from the code you can read, in the order above.
- `get_embed_snippet` gives the HTML that shows a whiteboard of a public project in a README.

## What the tools cannot do

They cannot upload pictures or videos, choose which side of a box an arrow leaves from, or undo. People add pictures in the app; an agent moves nodes instead of choosing sides.

## Finish

Read the whiteboard once more to check it, then give the person its address (the `url` from `read_whiteboard` or `create_document`) and a few lines on what you drew, what is nested where, and anything you left alone or need them to decide.
