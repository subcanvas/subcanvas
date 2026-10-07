# The launch video, rendered from a script

`demo.ts` is a [reelscript](https://github.com/trevin-lee/reelscript) script:
it drives a headless Chromium through the real app one frame at a time and
writes a 60 fps, 1920x1080 mp4. Nothing is screen-recorded, so after an
interface change the video is re-rendered, not re-shot.

About 44 seconds, for Product Hunt, where it autoplays muted. A caption on
the picture says each scene's point. There is no voice: the render is
silent, and a music track can be laid under it (see "Music" below).

1. `react/react` imported on camera, from GitHub like any import, so a
   repository becomes a diagram in the first five seconds. It has no
   `.subcanvas` files, so its main folders become boxes automatically. The
   cut wait is marked as sped up.
2. Its Packages box opens onto the diagram inside it.
3. This repository's own diagram, where `.subcanvas` files (a few lines of
   YAML in each folder) name the boxes and add the arrows: its Routes sheet,
   inside Application.
4. The "export API" arrow there, from Workspace (`src/app/[org]`) to API
   routes (`src/app/api`), opened into its page: an OpenAPI excerpt of the
   export routes, framed on the top of the YAML.
5. An agent draws one: a recorded Claude Code session over the MCP server,
   played back in a terminal beside the sheet while its edit is made again
   (see "The agent" below).
6. Share and Copy embed, then the embed in a README when `DEMO_README_URL`
   is set.
7. The end card.

Canvas shots are in view mode with the sidebar collapsed (set in the
prelude), so no editing tools and nothing of the demo account show. Against
a dev server the address bar is blank; against production it shows the real
address.

The same render writes the listing's pictures beside the video:
`gallery-1..4.png` (1270x760, a headline over a frame of the video) and
`thumbnail.gif` (240x240, the Subcanvas mark; its box opens on hover, and
its first frame is the mark at rest).

## Render it locally

It needs reelscript 0.3.0 or newer, for `waitFor` (with `settle`), a click
with no `duration`, zooms kept `within` the window, the `menubar` option,
and terminal output played from timed `events` at a fixed size.

```sh
# Once: the CLI (or `npm i -g @reelscript/cli`), its browser, and ffmpeg
git clone https://github.com/trevin-lee/reelscript ~/Git/reelscript && (cd ~/Git/reelscript && npm install && npm run build)
npx playwright install chromium
brew install ffmpeg

# A dev server on 3420. A worktree or clone: Next refuses two dev servers in
# one checkout.
pnpm dev --port 3420

# The video and the listing's pictures, to scripts/demo/out/ (ignored by git)
REELSCRIPT="node ~/Git/reelscript/dist/cli.js" pnpm demo:reel

# One frame, to iterate on a moment. Times are video times; 0 is the first shot.
REELSCRIPT_OUT= node ~/Git/reelscript/dist/cli.js preview scripts/demo/reel/demo.ts --at 12 --out frame.png
```

The first run creates the demo account (`reel-demo@subcanvas.test`, see the
header of `demo.ts`) and a staging team workspace, `reel-demo`
(`DEMO_STAGE_WORKSPACE`), that keeps finished imports of both repositories.
The import that happens on camera lands in the account's personal
workspace, where sign-up put it, while that is empty; after that, each run
creates a fresh team workspace for it. Nothing is deleted. A staging file
from before 2026-10-07 (`out/stage-<slug>.json`) does not have the sheets
this script needs; stage in a new workspace, or a new account, so the agent
does not find two copies of the project. The render prints
where each scene and caption starts. If the preparation fails, the page it
was on is in `out/failure.png`.

The local Supabase stack must be running (`supabase start`), and GitHub must
be reachable. Each import asks GitHub's API three times, and without a token
it allows sixty an hour from one address, so about fifteen renders an hour.
When they run out, the import fails and the render stops with "waitFor …
timed out"; the limit resets within the hour.

The staged import of this repository reads its default branch on GitHub,
while the terminal shows the file from this checkout; they should match. To
show a branch before it is merged, import a copy of it from disk:

```sh
mkdir -p /tmp/fixtures/subcanvas && git archive HEAD | tar -x -C /tmp/fixtures/subcanvas
SUBCANVAS_IMPORT_FIXTURES=/tmp/fixtures pnpm dev --port 3420
DEMO_SELF_REPOSITORY=fixture/subcanvas REELSCRIPT=... pnpm demo:reel
```

It is imported off camera, so the name never shows. A copy on disk is read
only by a dev server (`SUBCANVAS_IMPORT_FIXTURES` is ignored in production),
and `DEMO_ARROW_FILE` must then name the file in that copy, as an absolute
path. For the render you publish, use a fresh staging workspace
(`DEMO_STAGE_WORKSPACE`), so both staged imports are made from GitHub and
the agent runs against them.

## A local render of the published cut

Against a production build of `main` and the local stack, with a fresh
account, so the camera's import lands in its empty personal workspace and
the agent finds one Subcanvas project:

```sh
pnpm build && pnpm start --port 3420            # leave running

DEMO_EMAIL=reel-launch@subcanvas.test \
DEMO_STAGE_WORKSPACE=reel-launch \
DEMO_CLAUDE=/tmp/claude-latest/node_modules/.bin/claude \
DEMO_MUSIC=~/Downloads/subcanvas-music/lofi-jonasblakewood-573480.mp3 \
REELSCRIPT="node ~/Git/reelscript/dist/cli.js" pnpm demo:reel

# The same cut with the other track: the picture is copied, not rendered again
sh scripts/demo/reel/music.sh scripts/demo/out/demo.mp4 \
  ~/Downloads/subcanvas-music/tech-bombinsound-499582.mp3 scripts/demo/out/demo-tech.mp4

scripts/demo/readme-preview.sh                  # docs/media/demo.webp
```

## Music

The render is silent. `DEMO_MUSIC=<audio file>` makes `render.sh` lay that
track under it afterwards (`music.sh`): trimmed to the video, a 0.6 s fade
in, a 2.5 s fade out at the end, and loudness-normalised to -14 LUFS. The
track must be at least as long as the video. `music.sh <video> <track>
<out>` does the same to an existing render.

The tracks used so far, with their credits and license, are listed in
[../README.md](../README.md#music).

## The agent

Scene 5 is a real Claude Code session, recorded and played back. The first
render records it once: Claude Code runs interactively, in a terminal of its
own (macOS `script -r`, driven by `expect`), in `/tmp/subcanvas`, a clean
copy of this checkout's committed files, with the Subcanvas MCP server
signed in as the demo account. The token reaches it in the environment; the
`.mcp.json` written there names the variable, not the token. It runs on
that folder's settings alone (`--setting-sources project
--strict-mcp-config`): Opus at medium effort, allowed to read files and to
read and draw on whiteboards, and refused the shell, file edits and the web.
While it runs, the script watches the whiteboard for the moment its arrow
appears. The recording, that moment and the edit are kept in
`out/agent-<stage workspace>.json`, and the edit is undone at once.

On camera the recording plays in a terminal the size it was made at (80 by
30), sped up and marked so, and at the moment its arrow appeared the same
edit is made again through the MCP server, so the arrow arrives on the sheet
live. After the render it is undone again.

It needs `expect` (macOS has it) and Claude Code 2.1.280 or newer, signed
in; `DEMO_CLAUDE` names another CLI than `claude`. The session uses the
account's own usage, a few minutes of Opus, and whatever Claude Code shows
that account (its plan in the header, a usage notice) is in the recording,
so look at the frames. A kept session is only good for the sheet it drew
on, the request it was given and the terminal's size; otherwise it is
recorded again. Delete the file to record it again anyway.

## The published render: production

Before the first one:

- **A demo account on subcanvas.app.** Sign-up there confirms the email
  address, so make the account by hand (an address you can receive mail
  at) and confirm it. Its email shows at the foot of the sidebar, which is
  collapsed on camera.
- **Claude Code 2.1.280 or newer**, signed in, for the agent (Opus 5.5). The
  agent is recorded again against production, once, because a recording is
  only good for the sheet it drew on. `DEMO_CLAUDE` names another CLI than
  `claude`, for instance one installed with
  `npm i --prefix /tmp/claude-latest @anthropic-ai/claude-code@latest`.

Then, with the password typed into your own shell and nowhere else:

```sh
read -rs DEMO_PASSWORD && export DEMO_PASSWORD
DEMO_BASE_URL=https://subcanvas.app \
DEMO_EMAIL=<the demo account> \
DEMO_STAGE_WORKSPACE=<a new workspace slug, e.g. launch-stage> \
DEMO_README_URL=https://github.com/subcanvas/subcanvas \
REELSCRIPT="node ~/Git/reelscript/dist/cli.js" pnpm demo:reel

# The README's preview, from the new render (needs img2webp)
scripts/demo/readme-preview.sh
```

- Against production the address pill shows the real address, Copy embed
  is clicked, and the scene ends on the embed in the README, scrolled into
  view (it takes a reelscript whose page clock leaves scroll-driven
  animations alone, as github.com has them).
- The staging workspace, and after the first render a fresh team workspace
  per render, are created in production; delete them, and the import in the
  personal workspace, when the launch is over. The agent's arrow is taken off the
  sheet after the session and again after the render.

## Files

- `agent.ts`: the agent scene's recording, its replay, and a small client
  for the app's MCP endpoint.
- `demo.ts`: the scenes, the preparation before the camera rolls, and the
  post-processing: the cut of the sign-in prelude, the captions, the
  gallery pictures and the thumbnail. Its header lists every setting.
- `cards/end.html`: the end card. `caption.html`, `gallery.html` and
  `thumbnail.html`: templates the script photographs for the captions, the
  gallery pictures and the thumbnail. `fonts.css` inlines the latin subsets
  of Geist, Geist Mono and Bricolage Grotesque that the app ships (Chromium
  will not load a font file from a `file://` page). To regenerate it after a
  font change, base64 the three `.woff2` files from `.next/static/media/`
  into the `@font-face` rules.
- `render.sh`: what `pnpm demo:reel` runs.
