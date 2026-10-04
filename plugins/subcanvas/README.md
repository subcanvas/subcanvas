# Subcanvas for Claude Code

A Claude Code plugin for [Subcanvas](https://subcanvas.app), the whiteboard where any box opens into another whiteboard or a page. It gives Claude Code:

- **The Subcanvas MCP server** at `https://subcanvas.app/mcp`, so Claude Code can read and edit your workspaces as you.
- **A skill for drawing diagrams people can read** (`diagrams`): when to use a box, a text node, or a group; detail nested inside a box rather than beside it; arrows with short labels and a page that says why they exist; laying out after adding; reading before writing; and never deleting what a person made without asking. Claude Code loads it by itself whenever it works in Subcanvas.
- **Two commands**: `/subcanvas:map-repo` maps the repository you are in as a nested whiteboard, and `/subcanvas:update-diagram` checks a diagram against the code on your branch and fixes what is wrong, asking before it removes anything.

## Install

In your terminal:

```sh
claude plugin marketplace add subcanvas/subcanvas
claude plugin install subcanvas@subcanvas
```

Or inside Claude Code: `/plugin marketplace add subcanvas/subcanvas`, then `/plugin install subcanvas@subcanvas`.

Then start Claude Code, type `/mcp`, choose the Subcanvas server, and sign in. Your browser opens Subcanvas and asks whether to let Claude Code use it as you. There is no key to copy, and you can disconnect it at any time under Settings, Profile, Connected agents.

If you already added `https://subcanvas.app/mcp` with `claude mcp add`, you can keep it: Claude Code recognizes the plugin's server by its address and uses yours.

## What to ask your agent

<!-- The same prompts as src/lib/mcp/example-prompts.ts; a test keeps them in step. -->

- Map this repository's services and how they talk to each other as a Subcanvas whiteboard, then put a page behind each arrow saying what crosses it.
- Explain this pull request as a Subcanvas whiteboard: a box for each part it changes, arrows for how the changes depend on each other, and a page inside each box saying what changed and why.
- Turn docs/onboarding.md into a nested Subcanvas whiteboard: a box for each section, with its detail on a page or a whiteboard inside the box.
- Keep the Subcanvas diagram of this repository up to date with this branch. Add what the branch adds, fix what it changes, and ask me before you remove anything.
- Review the Architecture whiteboard in Subcanvas against the code and fix what is wrong. List anything you would delete and wait for my answer.

## Your own Subcanvas server

The plugin connects to subcanvas.app. If you run your own server ([docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md)), the skill and the commands work with it unchanged; only the server address differs. Add your server yourself:

```sh
claude mcp add --transport http --scope user subcanvas https://subcanvas.example.com/mcp
```

Then, in `/mcp`, sign in to `subcanvas` and turn off the plugin's own server, `plugin:subcanvas:subcanvas`, so Claude Code does not offer two of them. Your server's page at `/<workspace>/agents` shows its exact address.

## Updating

`claude plugin update subcanvas@subcanvas`, or `/plugin marketplace update subcanvas` in a session. To have it happen by itself, open `/plugin`, go to Marketplaces, choose subcanvas, and turn on auto-update.

For maintainers: users receive a change only when `version` in `.claude-plugin/plugin.json` changes, so raise it with every change to this folder, and check the plugin with `claude plugin validate .` from the repository root.

## License

AGPL-3.0-only, like the rest of this repository. See [LICENSE](../../LICENSE).
