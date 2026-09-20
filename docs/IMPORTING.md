# Importing your notes

Subcanvas imports Markdown. Most apps that hold notes can export it, so this is the way in from Notion, Obsidian, Google Docs, Bear, Apple Notes, a GitHub wiki, or a folder on your disk.

## How to import

In a project, open the **+** menu at the top of the tree and choose **Import files**. Pick files, a folder, or a zip. You can also drop any of those on the tree, or on a folder in it, and they go there. Every folder and document has the same two items in its own menu.

Before anything is created you see what will be: the documents and folders, and what is skipped and why. While it runs you see progress and can stop; what has been imported by then stays. At the end you get the same notes again as a summary.

**Paste Markdown**, in the same menu, makes one document from text you paste. Pasting Markdown straight into a document also works: the editor turns it into headings, lists, and tables.

Everything is read in your browser. A zip is never uploaded: only the text of the notes inside it is sent, a few documents at a time.

## Getting your notes out of other apps

| From | Do this | Then import |
|---|---|---|
| **Notion** | Settings → Export (or a page's ••• → Export). Format **Markdown & CSV**, include subpages. | The zip, as it is. |
| **Obsidian** | Nothing to export: a vault is a folder of Markdown. | The vault folder, or a zip of it. |
| **Google Docs** | File → Download → **Markdown (.md)**. | The `.md` file. |
| **Bear** | Select notes → File → Export Notes → **Markdown**. | The exported folder. |
| **Apple Notes** | Notes has no Markdown export. Use an exporter app (for example Exporter, from the Mac App Store) to get Markdown files. | The exported folder. |
| **GitHub wiki** | `git clone https://github.com/<owner>/<repo>.wiki.git` | The cloned folder. |
| **A docs folder** | | The folder, or a zip of it. |

## What comes across

- **Structure.** Folders stay folders. A document's title is the `# heading` it opens with, else `title` from its front matter, else the file's name. Front matter is left out of the text.
- **Notion.** The ids Notion adds to every name (`Page 0123abcd….md`) are removed. A page's subpages, which Notion puts in a folder next to the page, are nested under the page's document. A database (`.csv`) of up to 200 rows and 20 columns becomes a document with a table, and its rows' pages nest under it; a larger one is skipped. Large exports that Notion splits into several zips inside one zip are read as one.
- **Obsidian.** `[[Wiki links]]`, `[[Note|with a label]]`, and `[[folder/Note#Heading]]` become links to the imported documents. `![[Embedded note]]` becomes a link to it. A link to a note that is not in the import stays as written. Callouts become quotes with a bold title; `==highlights==` become plain text; tags stay as text. The `.obsidian` folder is ignored.
- **Links between files.** `[text](./other.md)`, relative paths, reference-style links, and the URL-encoded names Notion writes all become links to the imported documents. A link to a file that is not imported (a PDF, say) becomes plain text.
- **Formatting.** Headings, nested lists, task lists, tables, code blocks with their language, quotes, rules, bold, italic, strikethrough, inline code, links, and images on the web. Footnotes stay as readable text. HTML inside Markdown is reduced to its text; scripts are dropped.
- **Images.** Images on the web (`https://…`) stay. Images that are files in your export are **not imported yet**: their description stays in the text, and the import tells you how many there were. Image upload is coming.

## Limits

| | |
|---|---|
| One file | 500 KB of text. Larger files are skipped. |
| One import | 2,000 documents and 50 MB of text. Import a larger collection a folder at a time. |
| One zip | 5,000 entries. Attachments inside it can be of any size; they are not unpacked. |
| Kinds of file | `.md`, `.markdown`, `.txt`, `.csv`, and `.zip` holding those. `.docx` and `.html` are not imported: download Markdown instead (Google Docs offers it directly). |

Dotfiles, `__MACOSX`, and `node_modules` are ignored. In a zip, an entry whose path leads outside the zip is skipped and listed.

On the free plan, an import into a private project that would pass the private-document limit is refused before it starts, with the numbers. Viewers cannot import.

## For agents

The MCP tool `import_markdown_documents` does the same from a list of `{ path, markdown }`: see [MCP.md](MCP.md).
