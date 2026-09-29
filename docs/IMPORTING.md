# Importing your notes

Subcanvas imports Markdown, and the HTML export Notion makes. Most apps that hold notes can export one or the other, so this is the way in from Notion, Obsidian, Google Docs, Bear, Apple Notes, a GitHub wiki, or a folder on your disk.

## How to import

In a project, open the **+** menu at the top of the tree and choose **Import files**. Pick files, a folder, or a zip. You can also drop any of those on the tree, or on a folder in it, and they go there. Every folder and document has the same two items in its own menu.

Before anything is created you see what will be: the documents and folders, and what is skipped and why. While it runs you see progress and can stop; what has been imported by then stays. At the end you get the same notes again as a summary.

**Paste Markdown**, in the same menu, makes one document from text you paste. Pasting Markdown straight into a document also works: the editor turns it into headings, lists, and tables.

Everything is read in your browser. A zip is never uploaded whole: the text of the notes inside it is sent a few documents at a time, and each picture or video a note shows goes straight to storage, filed under the document that shows it, once that document exists.

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

## What comes across

- **Structure.** Folders stay folders. A document's title is the `# heading` it opens with, else `title` from its front matter, else the file's name. Front matter is left out of the text.
- **Notion.** Choose HTML when you export: it keeps what Markdown cannot say. Callouts keep their emoji and colour, columns stay columns, equations stay equations, bookmarks keep their title and description, toggles and toggle headings still fold, and text and block colours carry over. A table of contents is rebuilt from the page's headings. A link to another page, and each subpage where it sits in its parent, becomes that document's card.
- **Also from Notion.** The ids Notion adds to every name (`Page 0123abcd….html`) are removed, and so is the `Export-…` folder the export comes in, with the list of pages (`index.html`) Notion puts beside them. A page's subpages, which Notion puts in a folder next to the page (named with the page's id, or since 2026 by its title alone), are nested under the page's document. A database, whether a page of its own or inline in another page, becomes a document whose table lists its rows, each linking to the row's own page, which nests under it; a database row's properties are a table at the top of its page. A database of more than 200 rows or 20 columns keeps its rows as pages, and its table is left out. Large exports that Notion splits into several zips inside one zip are read as one. A Markdown & CSV export imports too, with less: Notion's Markdown has no columns, colours or bookmarks.
- **What does not come across from Notion.** Notion's export never holds page history, who a page is shared with, buttons, forms, or a database's views beyond the one it exports. Comments, page icons and covers are in some exports but are not imported, since documents have no place for them yet; neither are attached files such as PDFs (pictures and videos are: see below). A callout whose icon was a picture has no icon. People and dates mentioned in the text become their words. Every export from 2024 to now reads the same way, whichever version of Notion's markup it uses.
- **Obsidian.** `[[Wiki links]]`, `[[Note|with a label]]`, and `[[folder/Note#Heading]]` become links to the imported documents. `![[Embedded note]]` becomes a link to it. A link to a note that is not in the import stays as written. Callouts become quotes with a bold title; `==highlights==` become plain text; tags stay as text. The `.obsidian` folder is ignored.
- **Links between files.** `[text](./other.md)`, relative paths, reference-style links, and the URL-encoded names Notion writes all become links to the imported documents. A link to a file that is not imported (a PDF, say) becomes plain text.
- **Formatting.** Headings, nested lists, task lists, tables, code blocks with their language, quotes, rules, bold, italic, strikethrough, inline code, links, and images on the web. Footnotes stay as readable text. HTML inside Markdown is reduced to its text; scripts are dropped.
- **Pictures and videos.** Images on the web (`https://…`) stay as links to the web. Pictures and videos that are files in your import (PNG, JPEG, WebP, GIF, AVIF, MP4, WebM, MOV) are uploaded with the notes that show them, and count toward your org's storage like any you add yourself. A note gets its own copy of each, so whoever can read the note can see them. SVG and HEIC files, and ones over the size limits, are not imported; the words that described them stay in the text, and the import says how many. If the org's storage fills up during an import, the notes still come in and the pictures that did not fit show as missing. Files attached to a page (a PDF, say) are not imported yet; their names stay in the text.

## Limits

| | |
|---|---|
| One file | 500 KB of text. Larger files are skipped. |
| One import | 2,000 documents and 50 MB of text. Import a larger collection a folder at a time. |
| One zip | 5,000 entries. Attachments inside it can be of any size; they are not unpacked. |
| One HTML page | 2 MB as exported, and 500 KB once it is cut down to its content. |
| One picture or video | 10 MB for a picture, 100 MB for a video, as for ones you add yourself. |
| Kinds of file | `.md`, `.markdown`, `.txt`, `.csv`, `.html`, and `.zip` holding those. An HTML page that is not from Notion is imported as its body: headings, lists, tables, links and the like, with scripts, styles and forms dropped. `.docx` is not imported: download Markdown instead (Google Docs offers it directly). |

Dotfiles, `__MACOSX`, and `node_modules` are ignored. In a zip, an entry whose path leads outside the zip is skipped and listed.

On the free plan, an import into a private project that would pass the private-document limit is refused before it starts, with the numbers. Viewers cannot import.

## For agents

The MCP tool `import_markdown_documents` does the same from a list of `{ path, markdown }`: see [MCP.md](MCP.md).
