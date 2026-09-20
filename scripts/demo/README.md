# The demo that records itself

`record_demo.py` walks a storyboard through the real app while
[OpenScreen](https://getopenscreen.com) records the window, then exports the
video with a zoom wherever the cursor paused, burns in the captions, and cuts
one short clip per `clip:` marker. After an interface change, re-running it
gives a fresh, correct demo. No afternoon spent re-recording by hand.

## Run it

```sh
# Once
brew install uv ffmpeg                # and install OpenScreen from getopenscreen.com
uv run --with playwright playwright install chromium

# Check the storyboard still matches the app. Moves nothing, records nothing.
scripts/demo/record_demo.py --dry-run

# The real take, against a running app (pnpm dev, or production)
scripts/demo/record_demo.py
DEMO_BASE_URL=https://subcanvas.app DEMO_EMAIL=... DEMO_PASSWORD=... scripts/demo/record_demo.py
```

Output lands in `scripts/demo/out/` (ignored by git): `demo.mp4`,
`demo-captioned.mp4`, `demo.srt`, and `clip-<name>.mp4` for each marker.

**Before a real take**

- macOS: System Settings → Privacy & Security → **Screen Recording**: allow
  OpenScreen. **Accessibility**: allow the terminal you run this from, because the
  script moves and clicks the real pointer. Recording cannot start until both
  are granted, and macOS 15 and later asks again from time to time.
- Turn on Do Not Disturb, and do not touch the mouse while it runs. To abort,
  shove the pointer into a corner of the screen.
- `--dry-run --headless` needs none of this, so it can run in CI as a smoke
  test of the main flow.

## The storyboard

`storyboard.yaml` is an ordered list. Elements are named the way a person
would name them (by role and accessible name, by label, by visible text), so
a layout change does not break the demo and a renamed button breaks it
loudly. On failure, the script saves `out/failure.png` and says which step.

| Step | What it does |
|---|---|
| `goto: /path` | Open a page |
| `move: <target>` | Move the cursor there |
| `click: <target>`, `double_click: <target>` | Move, settle, click |
| `type: text` | Type into whatever has focus. `fast: true` for long text |
| `press: Enter` | A key or a combination (`Meta+\`) |
| `wait_for: <target>`, `wait_url: regex` | Wait for the app, not for a timer |
| `caption: text` | A caption, shown for the step's `pause` |
| `clip: name` | Start a new short clip here |
| `sign_in: { email, password, org }` | Prelude only: sign in, creating the account the first time |

A `<target>` is `{ role: button, name: Share }`, `{ label: Email }`,
`{ text: Pick a sheet }`, `{ placeholder: ... }`, `{ css: ... }` as a last
resort, or a bare string for visible text. `at: [0.2, 0.5]` aims at a point
inside the element. `pause:` is how long to hold after the step. `${NAME}`
reads an environment variable, with defaults under `env:`. Steps under
`prelude:` run before the camera rolls.
