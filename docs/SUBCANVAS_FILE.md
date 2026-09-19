# The `.subcanvas` file

"Import from GitHub" draws a repository as a diagram: one node per folder, the folder's README inside the node, and folders inside folders as whiteboards inside nodes. It works with no setup. A `.subcanvas` file is how a repository says more than its folders can: what a folder is called, what it is for, and what it talks to.

Put a file named `.subcanvas` in any folder. It is YAML, and every key is optional.

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

| Key | What it does |
|---|---|
| `title` | The node's title. Without it the folder name is used, tidied up (`payments-api` becomes "Payments API"). Up to 120 characters. |
| `description` | One or two sentences, shown in the panel when the node is selected. Without it the first paragraph of the folder's README is used. Up to 500 characters. |
| `connects` | Arrows from this folder to others. `to` is the other folder's path **from the repository root**. `label` is shown on the arrow. `description` becomes the document you read when you click the arrow, and may use Markdown. Up to 50 entries. |
| `ignore` | Subfolders to leave out, with everything inside them, as paths **from this folder**. Up to 100 entries. |

## What else the file does

- **A folder with a `.subcanvas` file is always on the diagram**, at any depth, along with the folders above it. An empty file is enough. Without one, the import maps folders that have a README, down to two levels, plus the folders directly inside `services`, `apps`, `packages`, `cmd`, `internal`, `libs`, and `modules`. It leaves out `docs`, `examples`, and tests.
- **A file at the repository root describes the repository.** Its `title` names the top whiteboard, and its `description` is the text at the top of it. `ignore` works there too. `connects` does not, because the repository is not a node.
- **Arrows are drawn where they can be.** An arrow joins two nodes on one whiteboard. When `services/payments` connects to `apps/web`, the two meet only at the top, so the arrow is drawn there, between `services` and `apps`. Several connections that land on the same pair of nodes become one arrow.
- **A `to` deeper than the diagram goes** is drawn to the nearest folder that is on it.

## When something is wrong

Nothing in a `.subcanvas` file can make an import fail. A file that is not valid YAML is ignored, a key that is not text is skipped, a path that leaves the repository (`../elsewhere`) is refused, and text over the limits is cut. Whatever was skipped is listed when the import finishes, by file. YAML anchors and aliases (`&name`, `*name`) are not accepted.

Dot-folders and dependency or build folders (`node_modules`, `vendor`, `dist`, `build`, `target`, and the like) are never mapped, whatever they contain.
