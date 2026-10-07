# Importing your notes

Subcanvas imports Markdown, and the HTML export Notion makes. Most apps that hold notes can export one or the other, so this is the way in from Notion, Obsidian, Google Docs, Bear, Apple Notes, a GitHub wiki, or a folder on your disk.

## How to import

In a project, open the **+** menu at the top of the tree and choose **Import files**. Pick files, a folder, or a zip. You can also drop any of those on the tree, or on a folder in it, and they go there. Every folder and document has the same two items in its own menu.

Before anything is created you see what will be: the documents and folders, and what is skipped and why. While it runs you see progress and can stop; what has been imported by then stays. At the end you get the same remarks again as a summary.

**Paste Markdown**, in the same menu, makes one document from text you paste. Pasting Markdown straight into a document also works: the editor turns it into headings, lists, and tables.

Everything is read in your browser. A zip is never uploaded whole: the text of the files inside it is sent a few documents at a time, and each picture or video a page shows goes straight to storage, filed under the document that shows it, once that document exists.

## Getting your notes out of other apps

| From | Do this | Then import |
|---|---|---|
| **Notion** | Settings → Export all workspace content (or a page's ••• → Export). Format **HTML**, include subpages, and turn on "Create folders for subpages". | The zip, as it is. |
| **Obsidian** | Nothing to export: a vault is a folder of Markdown. | The vault folder, or a zip of it. |
| **Google Docs** | File → Download → **Markdown (.md)**. | The `.md` file. |
| **Bear** | Select notes → File → Export Notes → **Markdown**. | The exported folder. |
| **Apple Notes** | Notes has no Markdown export. Use an exporter app (for example Exporter, from the Mac App Store) to get Markdown files. | The exported folder. |
| **GitHub wiki** | `git clone https://github.com/<owner>/<repo>.wiki.git` | The cloned folder. |
| **A docs folder** | | The folder, or a zip of it. |
| **Subcanvas** | A project's menu → Export project… ([EXPORTING.md](EXPORTING.md)). | The zip, as it is. Its pages come back; its whiteboards do not. |

## What comes across

- **Structure.** Folders stay folders. A document's title is the `# heading` it opens with, else `title` from its front matter, else the file's name. Front matter is left out of the text.
- **Notion.** Choose HTML when you export: it keeps what Markdown cannot say. Callouts keep their emoji and colour, columns stay columns, equations stay equations, bookmarks keep their title and description, toggles and toggle headings still fold, and text and block colours carry over. A table of contents is rebuilt from the page's headings. A link to another page, and each subpage where it sits in its parent, becomes that document's card.
- **Also from Notion.** The ids Notion adds to every name (`Page 0123abcd….html`) are removed, and so is the `Export-…` folder the export comes in, with the list of pages (`index.html`) Notion puts beside them. A page's subpages, which Notion puts in a folder next to the page (named with the page's id, or since 2026 by its title alone), are nested under the page's document. A database, whether a page of its own or inline in another page, becomes a document whose table lists its rows, each linking to the row's own page, which nests under it; a database row's properties are a table at the top of its page. A database of more than 200 rows or 20 columns keeps its rows as pages, and its table is left out. Large exports that Notion splits into several zips inside one zip are read as one. A Markdown & CSV export imports too, with less: Notion's Markdown has no columns, colours or bookmarks.
- **What does not come across from Notion.** Notion's export never holds page history, who a page is shared with, buttons, forms, or a database's views beyond the one it exports. Comments, page icons and covers are in some exports but are not imported, since documents have no place for them yet; neither are attached files such as PDFs (pictures and videos are: see below). A callout whose icon was a picture has no icon. People and dates mentioned in the text become their words. Every export from 2024 to now reads the same way, whichever version of Notion's markup it uses.
- **Obsidian.** `[[Wiki links]]`, `[[Note|with a label]]`, and `[[folder/Note#Heading]]` become links to the imported documents. `![[Embedded note]]` becomes a link to it. A link to a note that is not in the import stays as written. Callouts become quotes with a bold title; `==highlights==` become plain text; tags stay as text. The `.obsidian` folder is ignored.
- **Links between files.** `[text](./other.md)`, relative paths, reference-style links, and the URL-encoded names Notion writes all become links to the imported documents. A link to a file that is not imported (a PDF, say) becomes plain text.
- **Formatting.** Headings, nested lists, task lists, tables, code blocks with their language, quotes, rules, bold, italic, strikethrough, inline code, links, and pictures on the web. Footnotes stay as readable text. HTML inside Markdown is reduced to its text; scripts are dropped.
- **Pictures and videos.** Pictures on the web (`https://…`) stay as links to the web. Pictures and videos that are files in your import (PNG, JPEG, WebP, GIF, AVIF, MP4, WebM, MOV) are uploaded with the pages that show them, and count toward your workspace's storage like any you add yourself. A page gets its own copy of each, so whoever can read the page can see them. SVG and HEIC files, and ones over the size limits, are not imported; the words that described them stay in the text, and the import says how many. If the workspace's storage fills up during an import, the pages still come in and the pictures that did not fit show as missing. Files attached to a page (a PDF, say) are not imported yet; their names stay in the text.

## Limits

| | |
|---|---|
| One file | 500 KB of text. Larger files are skipped. |
| One import | 2,000 documents and 50 MB of text. Import a larger collection a folder at a time. |
| One zip | 5,000 entries. Attachments inside it can be of any size; they are not unpacked. |
| One HTML page | 2 MB as exported, and 500 KB once it is cut down to its content. |
| One picture or video | 10 MB for a picture, 100 MB for a video, as for ones you add yourself. |
| Kinds of file | `.md`, `.markdown`, `.txt`, `.csv`, `.html`, and `.zip` holding those. An HTML page that is not from Notion is imported as its body: headings, lists, tables, links and the like, with scripts, styles and forms dropped. `.docx` is not imported: download Markdown instead (Google Docs offers it directly). |

Dotfiles, `__MACOSX`, and `node_modules` are ignored, and so are the `README.txt` and `subcanvas-export.json` at the top of a Subcanvas export. Exactly what comes back from one is in [EXPORTING.md](EXPORTING.md#bringing-it-back). In a zip, an entry whose path leads outside the zip is skipped and listed.

On the free plan, an import into a private project that would pass the private-document limit is refused before it starts, with the numbers. Viewers cannot import.

## Mermaid diagrams

Mermaid is the text READMEs, wikis and agents write diagrams in. Subcanvas draws it as a whiteboard of real boxes, groups and arrows: each can be moved, renamed, given a shape or a color, and opened into a page or a whiteboard of its own, like anything drawn by hand.

### Where

- **Paste Mermaid**, in the project's **+** menu and in every folder's and document's menu, makes a new whiteboard there, named after the diagram's `title` (from front matter or a `title` line) or else after its kind. Before anything is made it says how many boxes, groups and arrows will be drawn, and lists what will not be.
- **On an open whiteboard**, paste Mermaid text (on its own, or in a ```` ```mermaid ```` fence) and the whiteboard asks whether to add it. It goes beside what is already there, never on top, and one undo takes it all away again. Text that only starts like Mermaid ("graph theory says...") is not offered; the first line has to be the diagram's header and nothing else.
- **In a page**, a ```` ```mermaid ```` code block stays a code block, whether you typed it or it came in with Import files or Paste Markdown. Its block menu (the handle to its left) has **Draw as a whiteboard**, which makes the whiteboard inside the page and puts a link to it under the code. The code is the diagram's source: it downloads as the same Markdown, GitHub and every other Markdown reader still show it, and an import does not make whiteboards nobody asked for (they would count toward the free plan's private documents). Drawing it is one click.
- **Agents** use the MCP tool `import_mermaid`, which makes a new whiteboard or adds to one ([MCP.md](MCP.md)).

### What is drawn

| Mermaid | On the whiteboard |
|---|---|
| A flowchart (`flowchart` or `graph`), in any direction (`TB`, `TD`, `BT`, `LR`, `RL`) | Boxes laid out along the arrows in that direction, with the same layout an imported repository gets. Boxes of one shape share a size, wide enough for their titles. |
| Node shapes | The nearest of the whiteboard's shapes: `A[ ]` rectangle, `A( )` and `A([ ])` pill, `A(( ))` and `A((( )))` ellipse, `A{ }` diamond, `A{{ }}` hexagon, `A[( )]` cylinder, `A[/ /]`, `A[\ \]` and the trapezoids parallelogram, `A[[ ]]` and `A> ]` rectangle. The newer `A@{ shape: cyl, label: "Orders" }` form is read too: cylinders, documents, clouds, circles, diamonds and the rest, and `shape: text` is a text node. A shape the whiteboard has nothing near to is a rectangle. |
| Links | Arrows. `-->` points forward, `---` has no head, `<-->` points both ways, `-.->` is dotted. Labels written `-->|label|` or `-- label -->`. Chains (`A --> B --> C`) and `&` (`A & B --> C & D`) make every arrow they say. A longer link (`--->`) leaves more room between its ends. |
| Subgraphs | Groups, nested as written, with the subgraph's title. A link to a subgraph is an arrow to its group. |
| Labels | Quotes, `<br>`, Markdown strings and entity codes (`#quot;`, `&amp;`) become plain words. |
| A sequence diagram (`sequenceDiagram`) | A whiteboard has no timeline, so it shows who talks to whom. Participants are boxes in a row, in the order they appear; an `actor` wears a person icon, a `database` participant is a cylinder, and a `box` around participants is a group. The messages sent one way between two participants are one arrow, numbered in the order they were sent (`1. Log in, 3. Fetch`); replies (`-->>`) are dotted. An arrow to the next participant is straight; one that passes others goes over the row, and one that goes back comes under it. |
| An ER diagram (`erDiagram`) | Entities are boxes. A box shows only its title, so an entity's attributes are a table (attribute, type, key, comment) on the page inside its box, a click away. Relationships are arrows from the first entity to the second, labelled with their words and cardinality, `places (1 to 0..*)`, and dotted when Mermaid draws them dashed (a non-identifying relationship). |

Subgraphs become groups, not whiteboards inside boxes, because Mermaid's links cross subgraph borders freely: on one whiteboard every one of them can still be drawn, and a group can be dragged, resized or ungrouped like any other.

### What is not drawn

Nothing is left out without a word: what is not drawn as written is listed before you add it, and an agent gets the same list.

- **Look.** Styles, classes and `linkStyle` (boxes take the whiteboard's own look), themes and `%%{init}%%` settings, Font Awesome icons in labels, and icon and picture nodes (drawn as boxes with their label).
- **Flowcharts.** `click` actions, a direction inside a subgraph (the whole diagram flows one way), thick links and circle or cross heads (drawn as ordinary arrows), invisible links (`~~~`, which still place boxes but are not drawn), and an arrow from a box to itself.
- **Sequence diagrams.** Notes, activations, `rect` highlights and the colors of boxes; loops, alternatives and other blocks (`loop`, `alt`, `opt`, `par`, `critical`, `break`) are not drawn, but the messages inside them are. A message from a participant to itself.
- **ER diagrams.** A relationship of an entity with itself.
- **Lines that cannot be read** are quoted with their line number, and the rest of the diagram is still drawn.
- **Other kinds of diagram** (class, state, Gantt, pie, mind map, and the rest) are refused by name. A diagram of more than 100 KB is refused too.

## For agents

The MCP tool `import_markdown_documents` does the same from a list of `{ path, markdown }`, and `import_mermaid` draws Mermaid: see [MCP.md](MCP.md).
