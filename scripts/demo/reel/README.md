# The launch video, rendered from a script

`demo.ts` is a [reelscript](https://github.com/trevin-lee/reelscript) script:
it drives a headless Chromium through the real app one frame at a time and
writes a 60 fps, 1920x1080 mp4 with narration. Nothing is screen-recorded,
so after an interface change the video is re-rendered, not re-shot.

About 43 seconds, for Product Hunt, where it autoplays muted. A caption on
the picture says each scene's point, and the narration says the same:

1. Into this repository's own diagram, two boxes deep, each box opening
   into the diagram inside it. Its names and arrows come from its
   `.subcanvas` files.
2. An arrow there, opened into the page that says why it exists.
3. The `.subcanvas` file that drew that arrow, in a terminal beside it.
4. `react/react` imported on camera, from GitHub like any import. It has no
   `.subcanvas` files, so its folders become boxes on their own: what
   anyone gets with no setup. The wait is cut, and marked as sped up.
5. Share and Copy embed, then the embed in a README when `DEMO_README_URL`
   is set.
6. The end card.

Canvas shots are in view mode with the sidebar collapsed (set in the
prelude), so no editing tools and nothing of the demo account show. Against
a dev server the address bar is blank; against production it shows the real
address.

The same render writes the listing's pictures beside the video:
`gallery-1..4.png` (1270x760, a headline over a frame of the video) and
`thumbnail.gif` (240x240, the Subcanvas mark; its box opens on hover, and
its first frame is the mark at rest).

## Render it locally

It needs a reelscript newer than 0.2.0, for `waitFor` (with `settle`), a
click with no `duration`, zooms kept `within` the window, and the `menubar`
option.

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

The first run creates the demo account (`demo@subcanvas.test`, see the
header of `demo.ts`) and a staging org, `demo-stage`, that keeps finished
imports of both repositories. Every run also creates a fresh, empty org for
the import that happens on camera; nothing is deleted. The render prints
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

It is imported off camera, so the name never shows. Delete
`out/stage-demo-stage.json` before the render you publish, so both staged
imports are made again from GitHub.

## The published render: production

```sh
DEMO_BASE_URL=https://subcanvas.app \
DEMO_EMAIL=... DEMO_PASSWORD=... \
DEMO_README_URL=https://github.com/subcanvas/subcanvas \
REELSCRIPT="node ~/Git/reelscript/dist/cli.js" pnpm demo:reel
```

- Against production the address pill shows the real address, Copy embed
  is clicked, and with `DEMO_README_URL` the scene ends on the embed in that
  README (the page must have one, near enough the top to be found).
- The account must exist, or sign-up must not need email confirmation. Its
  email shows at the foot of the sidebar.
- The staging org and one fresh org per render are created in production;
  delete them when the launch is over.

## Files

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
