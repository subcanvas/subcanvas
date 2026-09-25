# The launch video, rendered from a script

`demo.ts` is a [reelscript](https://github.com/trevin-lee/reelscript) script:
it drives a headless Chromium through the real app one frame at a time and
writes a 60 fps mp4 with narration. Nothing is screen-recorded, so after an
interface change the video is re-rendered, not re-shot. It is the storyboard
in `../storyboard.yaml`, tightened to about 50 seconds for Product Hunt,
with a title card before each beat so it works with the sound off.

On camera, this repository is imported from GitHub, and the video walks
through the diagram it becomes. The frame is 16:9 and the file 1920x1080,
which is what YouTube and Product Hunt's player expect.

## Render it locally

```sh
# Once: the CLI (or `npm i -g @reelscript/cli`), its browser, and ffmpeg
git clone https://github.com/trevin-lee/reelscript ~/Git/reelscript && (cd ~/Git/reelscript && npm install && npm run build)
npx playwright install chromium
brew install ffmpeg

# A dev server on 3420. A worktree or clone: Next refuses two dev servers in
# one checkout.
pnpm dev --port 3420

# The video, to scripts/demo/out/demo.mp4 (ignored by git)
REELSCRIPT="node ~/Git/reelscript/dist/cli.js" pnpm demo:reel

# One frame, to iterate on a moment. Times are video times; 0 is the first card.
REELSCRIPT_OUT= node ~/Git/reelscript/dist/cli.js preview scripts/demo/reel/demo.ts --at 12 --out frame.png
```

The first run creates the demo account (`demo@subcanvas.test`, see the
header of `demo.ts`) and a staging org, `demo-subcanvas`, that keeps a
finished import of the repository. Every run also creates a fresh, empty
org for the import that happens on camera; nothing is deleted. The render
prints where each beat starts. If the preparation fails, the page it was on
is in `out/failure.png`.

The local Supabase stack must be running (`supabase start`), and GitHub
must be reachable: each import asks its API three times, well inside the
sixty an hour it allows without a token.

The import reads the repository's default branch on GitHub, so a change to
its `.subcanvas` files shows in the video once it is merged. To render a
branch before then, import a copy of it from disk:

```sh
mkdir -p /tmp/fixtures/subcanvas && git archive HEAD | tar -x -C /tmp/fixtures/subcanvas
SUBCANVAS_IMPORT_FIXTURES=/tmp/fixtures pnpm dev --port 3420
DEMO_REPOSITORY=fixture/subcanvas REELSCRIPT=... pnpm demo:reel
```

The staging import is shared between the two (both are `demo-subcanvas`),
so delete `out/stage-demo-subcanvas.json` before the render you publish.

## Launch day: production and the real repository

```sh
DEMO_BASE_URL=https://subcanvas.app \
DEMO_EMAIL=... DEMO_PASSWORD=... \
DEMO_IMPORT_WAIT=2500 \
REELSCRIPT="node ~/Git/reelscript/dist/cli.js" pnpm demo:reel
```

- The account must exist, or sign-up must not need email confirmation.
- `DEMO_INTO` names the two boxes the camera goes into, outermost first,
  and `DEMO_ARROW` the label of the arrow it clicks; `DEMO_ARROW_DEPTH` says
  which sheet that arrow is on (0 the top one, 1 inside the first box). All
  three come from the repository's `.subcanvas` files, and the defaults fit
  this repository.
- `DEMO_IMPORT_WAIT` is how much video (ms) to hold on the dialog while the
  import runs; reelscript then waits off camera, up to about three seconds
  more, for the whiteboard. If the import is slower than that the render
  stops with "target ... was not found", and the number needs to go up.
- The staging org is created in production on the first run and reused
  after; delete it by hand when the launch is over.

## Thumbnail and stills

```sh
scripts/demo/reel/stills.sh            # thumbnail.gif (240x240) and gallery-1..4.png (1270x760)
```

They are cut from `out/demo.mp4` at the times of the beats; `THUMB_AT` and
`GALLERY_AT` (four times, in seconds) move them.

## Files

- `demo.ts`: the beats, the preparation before the camera rolls, and the cut
  of the sign-in prelude. Its header lists every environment variable.
- `cards/`: one HTML title card per beat, opened as `file://` pages between
  beats. `fonts.css` inlines the latin subsets of Geist, Geist Mono and
  Bricolage Grotesque that the app ships (Chromium will not load a font file
  from a `file://` page). To regenerate it after a font change, base64 the
  three `.woff2` files from `.next/static/media/` into the `@font-face`
  rules.
- `render.sh`: what `pnpm demo:reel` runs. `stills.sh`: the thumbnail and
  the gallery pictures.
