# Exporting your work

Everything in Subcanvas comes out as ordinary files: one document at a time, or a whole project as one zip. Whoever can read a document can download it, viewers and visitors to a public project included, and an export holds exactly what that person can read.

## One document

In the project tree, open a document's menu (**•••**):

- **Download as Markdown**, on a page. The file opens with the page's title as a `# heading`, then its text in the Markdown the MCP tools read and write ([MCP.md](MCP.md#tools)): an equation as `$$`, maths in a line as `$…$`, a callout as `<aside data-icon="💡">`, a table of contents as `[TOC]`. A card for another document becomes a link to it on a line of its own, and a picture or a video becomes `![caption](address)`. Links and pictures point at their addresses in the app, which open for whoever can read them.
- **Download as SVG**, on a whiteboard. It is the picture a public whiteboard's embed shows (see "Embedding a diagram" in the [README](../README.md)), for private whiteboards too. Pictures and videos on the whiteboard are drawn as captioned frames: an SVG file is one image that loads nothing else.

## A whole project

In the project menu (**•••** beside the project's name), choose **Export project…**, then **Export**. Every member of the workspace can, viewers included. When it is done the browser saves `<project name>.zip`, and the dialog lists anything that was left out.

| In the zip | What it is |
|---|---|
| `Folder/` | A folder of the project |
| `Page.md` | A page, written as above |
| `Board.svg` | A whiteboard, as its picture |
| `Board.json` | The whiteboard's contents: every box, arrow and group, and what each one holds ([below](#the-whiteboard-file)) |
| `Page/`, `Board/` | What a document holds: the pages and whiteboards nested in it, the documents its boxes and arrows hold (a box's description is a page there), and the pictures and videos it shows |
| `README.txt` | What is where, and what was left out, for a person |
| `subcanvas-export.json` | Every folder and document with its id, for a program ([below](#the-manifest)) |

This is the layout a Notion export has, which is what lets Import files read it back.

- **Names.** A file is named after its document. What no file system takes (`/ \ : * ? " < > |`) is left out or becomes a dash, a leading dot is dropped, and when two things in one folder would share a name, the later one gets a number: `Notes 2.md`.
- **Links.** A link or a card to a document in the zip is a relative path to its file, so the files work together once unzipped: in an editor such as Obsidian or VS Code, or on GitHub. A link to a whiteboard opens its picture. Pictures and videos sit in the folder of the page that shows them, and the page points at them the same way: `![Service map](Setup/Service%20map.png)`.
- **What stays an address.** A document that is not in the zip (in another project, or in the trash) keeps its address in the app, and so does a picture that Storage could not give.
- **What is left out.** The trash, and everything inside a document that is in the trash. Folders keep their place even when empty.

### How it is made

The zip is put together in your browser. The server converts documents a batch at a time and streams them back (`/api/projects/<id>/export/documents`), and pictures and videos come straight from Storage; no file passes through the app, and no answer from the server is larger than one batch. So a project of any size exports the same way, on any host: Vercel, for one, caps a function's answer at about 4.5 MB.

Every read goes through your own session, or through none on a public project, so row-level security decides what is in the export exactly as it decides what the pages show. Nothing on the way uses the secret key. A viewer's export and an editor's hold the same documents; a visitor to a public project can download its documents one at a time.

Keep the tab open until the zip is saved. Stopping, or closing the dialog, throws away what was made so far.

### Limits

A zip made this way holds up to 4 GB and 65,000 files, which is what a zip can hold without the ZIP64 extension. Pictures and videos that would pass either are left out and listed in `README.txt`. The browser holds the zip until it is saved, so a project with gigabytes of video needs the room for it.

## The whiteboard file

`Board.json` is everything on the whiteboard, with every field present (`null` where there is nothing), so a program that reads it needs to know no defaults.

```json
{
  "format": "subcanvas-whiteboard",
  "version": 1,
  "id": "6b1c4b7a-d57a-4a12-9217-40f898f7e4b2",
  "title": "Architecture",
  "nodes": [
    {
      "id": "…",
      "kind": "plain",
      "title": "Payments",
      "description": "",
      "x": 120, "y": 80, "width": 160, "height": 64,
      "group": null,
      "color": "default", "shape": "rectangle", "icon": null, "emoji": null,
      "open_mode": "panel",
      "repository_path": null,
      "holds": { "id": "…", "type": "text", "title": "Payments", "path": "Architecture/Payments.md", "url": "https://subcanvas.app/…" },
      "media": null
    }
  ],
  "edges": [
    {
      "id": "…", "source": "…", "target": "…",
      "source_handle": null, "target_handle": "left",
      "label": "charges", "direction": "forward", "shape": "spline", "stroke": "solid",
      "color": "default", "icon": null, "emoji": null, "open_mode": "panel",
      "holds": null
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `kind` | `plain` is a box, `text` a heading with no box, `group` a frame around other nodes, `media` a picture or a video |
| `x`, `y` | The top-left corner, in canvas units. For a node in a group, from the group's corner |
| `width`, `height` | Null when the node is sized to fit its text |
| `group` | The id of the group the node is in |
| `description` | A text node's paragraph |
| `repository_path` | The folder of a repository the node stands for, when it came from a GitHub import |
| `holds` | The document the node or arrow opens into: its `id`, `type` (`text` or `whiteboard`) and `title`; `path`, its file from the top of the zip (a page's `.md`, a whiteboard's `.json`) when it is in the export; `url`, its address in the app when you can read it |
| `media` | On a picture or video: `type` (`image` or `video`), the file's `width` and `height` in pixels, its `alt` text, `path` in the zip, and `url` in the app. The caption is the node's `title` |
| `source_handle`, `target_handle` | The side an arrow leaves or reaches (`top`, `right`, `bottom`, `left`), or null for the side facing the other end |
| `direction` | Where the arrowheads are: `none`, `forward`, `reverse`, `both` |

Colors are names (`red`, `blue`, …), which each theme draws in its own shade.

## The manifest

`subcanvas-export.json` has the `format` (`subcanvas-export`), a `version`, when it was made (`exported_at`), the app it came `from`, the `project`'s id and name, every `folder` with its path, every `document` with its `id`, `type`, `kind` (`description` for a box's description), `title`, `path` (its name without an extension: what it holds is in the folder of that name) and `files`, and `left_out`: each file that is not in the zip, and why. Import files also reads its presence as the sign that a zip is a Subcanvas export.

## Bringing it back

Import files ([IMPORTING.md](IMPORTING.md)) takes the zip as it is, or the folder it unzips to.

What comes back:

- Every page, in the same folders, with its title and its text: headings, lists, tables, code, quotes, equations, callouts, tables of contents.
- Pages nested in a page, nested under it again.
- The pictures and videos the pages show, uploaded again with them.
- Links between pages, pointing at the documents they became.

What does not:

- **Whiteboards.** Their `.svg` and `.json` files are skipped, and the import says so. The documents their boxes held come back as pages, in a folder named after the whiteboard (or, where the whiteboard was inside a page, under a page of that name). The JSON file keeps everything that is needed to draw it again.
- **Cards.** A card for another document comes back as a link to it, on a line of its own.
- **What Markdown cannot say.** Text colors, highlights, alignment, and a block's background color. A picture's caption becomes its description (alt text), and a bookmark a link.
- **Empty folders.** An import makes the folders its files need.
- **Identity.** Everything imported is new: its ids are new, so links to the old documents from elsewhere do not lead to the new ones.
- **The export's own files.** `README.txt` and `subcanvas-export.json` beside it are read as the export's and not imported.

The import's limits apply: one import takes up to 2,000 documents and a zip of up to 5,000 files. Unzip a larger export and import it a folder at a time.

## For agents

There is no MCP tool for downloads or exports. A tool's result is text for an agent to read, and a zip is a file; an agent reads the same documents with `get_project`, `read_text_document` (the same Markdown as a download, block by block, with ids to edit by) and `read_whiteboard` (the same contents as the JSON file). See [MCP.md](MCP.md).
