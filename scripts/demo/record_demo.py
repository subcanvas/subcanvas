#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.49", "pyautogui>=0.9.54", "pyyaml>=6"]
# ///
"""Record the product demo by itself.

A storyboard (storyboard.yaml) lists what happens. This script opens a
browser at a fixed size, asks the page where each element is, moves the real
cursor there the way a person would, and clicks. OpenScreen records the
window meanwhile and then exports the video, zooming in wherever the cursor
paused. Captions and clip boundaries come from the storyboard.

    scripts/demo/record_demo.py --dry-run     # no recording, no real cursor
    scripts/demo/record_demo.py               # the real take

Run `playwright install chromium` once. A real take needs macOS to allow
Screen Recording for OpenScreen and Accessibility for the terminal that runs
this. See README.md in this folder.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from playwright.sync_api import Locator, Page, sync_playwright

HERE = Path(__file__).parent
OPENSCREEN = Path("/Applications/Openscreen.app/Contents/MacOS/Openscreen")
# OpenScreen finds the window to record by its title, and every page sets its
# own, so the browser gets a marker that the script keeps in the title.
WINDOW_MARK = "Subcanvas demo"


@dataclass
class Take:
    """What happened when, so captions and clips can be cut afterwards."""

    started: float = 0.0
    captions: list[tuple[float, float, str]] = field(default_factory=list)
    clips: list[tuple[str, float]] = field(default_factory=list)

    def now(self) -> float:
        return time.monotonic() - self.started


# The cursor ----------------------------------------------------------------


def ease(t: float) -> float:
    """Minimum-jerk: how a hand moves. Slow, fast, slow, with no sharp start."""
    return 10 * t**3 - 15 * t**4 + 6 * t**5


def path(start: tuple[float, float], end: tuple[float, float], steps: int):
    """A slightly bowed line. A perfectly straight one reads as a robot."""
    (x0, y0), (x1, y1) = start, end
    distance = math.hypot(x1 - x0, y1 - y0)
    bow = min(40.0, distance * 0.08) * random.choice((-1, 1))
    # The control point sits off the midpoint, at a right angle to the line.
    nx, ny = (-(y1 - y0) / distance, (x1 - x0) / distance) if distance else (0, 0)
    cx, cy = (x0 + x1) / 2 + nx * bow, (y0 + y1) / 2 + ny * bow
    for i in range(1, steps + 1):
        t = ease(i / steps)
        yield (
            (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t**2 * x1,
            (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t**2 * y1,
        )


class Cursor:
    """Moves the pointer to page coordinates. In a dry run it is Playwright's
    pointer, which needs no permissions; in a real take it is the system's,
    which is the one a screen recorder sees."""

    def __init__(self, page: Page, real: bool):
        self.page, self.real = page, real
        self.at = (640.0, 400.0)
        if real:
            import pyautogui

            pyautogui.FAILSAFE = True  # slam the pointer into a corner to abort
            pyautogui.PAUSE = 0
            self.gui = pyautogui

    def origin(self) -> tuple[float, float]:
        """Where the page's top left corner is on the screen, in points."""
        return tuple(
            self.page.evaluate(
                "() => [window.screenX + (window.outerWidth - window.innerWidth) / 2,"
                " window.screenY + (window.outerHeight - window.innerHeight)]"
            )
        )

    def move(self, x: float, y: float, seconds: float | None = None):
        distance = math.hypot(x - self.at[0], y - self.at[1])
        seconds = seconds or min(1.2, 0.35 + distance / 1400)
        steps = max(12, int(seconds * 90))
        ox, oy = self.origin() if self.real else (0, 0)
        for px, py in path(self.at, (x, y), steps):
            if self.real:
                self.gui.moveTo(ox + px, oy + py, _pause=False)
            else:
                self.page.mouse.move(px, py)
            time.sleep(seconds / steps)
        self.at = (x, y)

    def click(self, double: bool = False):
        if self.real:
            self.gui.click(clicks=2 if double else 1, interval=0.12)
        else:
            self.page.mouse.click(*self.at, click_count=2 if double else 1)


# Steps ---------------------------------------------------------------------


def find(page: Page, target: dict | str) -> Locator:
    """A storyboard names elements the way a person would: by role and name,
    by visible text, by label. A CSS selector is the last resort."""
    if isinstance(target, str):
        return page.get_by_text(target, exact=False).first
    if "role" in target:
        return page.get_by_role(target["role"], name=target.get("name"), exact=target.get("exact", False)).first
    if "label" in target:
        return page.get_by_label(target["label"]).first
    if "placeholder" in target:
        return page.get_by_placeholder(target["placeholder"]).first
    if "text" in target:
        return page.get_by_text(target["text"], exact=target.get("exact", False)).first
    return page.locator(target["css"]).first


def center(locator: Locator, at: tuple[float, float] | None) -> tuple[float, float]:
    locator.wait_for(state="visible", timeout=15_000)
    locator.scroll_into_view_if_needed()
    box = locator.bounding_box()
    if not box:
        raise RuntimeError(f"{locator} has no box")
    fx, fy = at or (0.5, 0.5)
    return box["x"] + box["width"] * fx, box["y"] + box["height"] * fy


def keep_title(page: Page):
    page.evaluate(
        "(mark) => { if (!document.title.includes(mark)) document.title = `${document.title} · ${mark}` }",
        WINDOW_MARK,
    )


def sign_in(page: Page, base_url: str, email: str, password: str, org: str):
    """Signs in, creating the account and its org the first time. Only ever
    used before the camera rolls."""
    page.goto(f"{base_url}/login", wait_until="networkidle")
    page.get_by_label("Email").fill(email)
    page.get_by_label("Password").fill(password)
    page.get_by_role("button", name="Sign in", exact=True).click()
    try:
        page.wait_for_url(lambda url: "/login" not in url, timeout=6_000)
    except Exception:
        page.get_by_role("button", name="Create an account").click()
        page.get_by_label("Password").fill(password)
        page.get_by_role("button", name="Create account").click()
        page.wait_for_url(lambda url: "/login" not in url, timeout=15_000)
    # A new account is sent on to create its org, a redirect later.
    page.goto(base_url, wait_until="networkidle")
    if "/onboarding" in page.url:
        page.get_by_label("Name").fill(org)
        page.get_by_label("URL").fill(re.sub(r"[^a-z0-9]+", "-", f"{org}-{email.split('@')[0]}".lower()).strip("-")[:40])
        page.get_by_role("button", name="Create org").click()
        page.wait_for_url(lambda url: "/onboarding" not in url, timeout=15_000)


def run_step(step: dict, page: Page, cursor: Cursor, take: Take, base_url: str, env: dict[str, str]):
    (kind, value), = ((k, v) for k, v in step.items() if k not in ("pause", "at", "fast"))
    fill = lambda text: re.sub(r"\$\{(\w+)\}", lambda m: env.get(m.group(1), ""), text)

    if kind == "goto":
        page.goto(base_url + fill(value), wait_until="networkidle")
    elif kind == "move":
        cursor.move(*center(find(page, value), step.get("at")))
    elif kind in ("click", "double_click"):
        cursor.move(*center(find(page, value), step.get("at")))
        time.sleep(0.18)  # a person settles before pressing
        cursor.click(double=kind == "double_click")
    elif kind == "type":
        # Typed through the browser, not the system keyboard: the text is
        # right whatever the keyboard layout, and it still looks typed.
        page.keyboard.type(fill(value), delay=20 if step.get("fast") else 55)
    elif kind == "press":
        page.keyboard.press(value)
    elif kind == "wait_for":
        find(page, value).wait_for(state="visible", timeout=60_000)
    elif kind == "wait_url":
        page.wait_for_url(re.compile(value), timeout=60_000)
    elif kind == "sign_in":
        sign_in(page, base_url, fill(value["email"]), fill(value["password"]), fill(value.get("org", "Demo")))
    elif kind == "caption":
        take.captions.append((take.now(), take.now() + float(step.get("pause", 3)), value))
    elif kind == "clip":
        take.clips.append((value, take.now()))
    else:
        raise ValueError(f"Unknown step: {kind}")

    keep_title(page)
    time.sleep(float(step.get("pause", 0.4)))


# Recording -----------------------------------------------------------------


class Recorder:
    def __init__(self, project: Path):
        self.project = project
        self.process: subprocess.Popen | None = None

    def start(self):
        self.process = subprocess.Popen(
            [str(OPENSCREEN), "record", "--window", WINDOW_MARK, "--cursor", "editable-overlay",
             "--project", str(self.project), "--json"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        for line in self.process.stdout:
            event = self._event(line)
            if event.get("event") == "error":
                raise RuntimeError(event.get("message", "OpenScreen could not start recording"))
            # The first log line after "started" means frames are being captured.
            if event.get("event") in ("log", "progress"):
                return

    def stop(self):
        self.process.stdin.write("stop\n")
        self.process.stdin.flush()
        for line in self.process.stdout:
            event = self._event(line)
            if event.get("event") == "done":
                if not event.get("success"):
                    raise RuntimeError("OpenScreen did not finish the recording")
                return
        raise RuntimeError("OpenScreen exited without finishing the recording")

    @staticmethod
    def _event(line: str) -> dict:
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            return {}


def export(project: Path, video: Path):
    subprocess.run([str(OPENSCREEN), "export", str(project), "-o", str(video),
                    "--auto-zoom", "--quality", "good", "--json"], check=True)


def stamp(seconds: float) -> str:
    ms = int(seconds * 1000)
    return f"{ms // 3_600_000:02}:{ms // 60_000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def write_captions(take: Take, srt: Path):
    srt.write_text(
        "\n".join(f"{i}\n{stamp(a)} --> {stamp(b)}\n{text}\n" for i, (a, b, text) in enumerate(take.captions, 1))
    )


def burn_and_cut(video: Path, srt: Path, take: Take, out: Path, total: float):
    """Feeds autoplay muted, so the words go into the picture. Then one file
    per `clip` marker, for posts that want fifteen seconds, not ninety."""
    final = out / "demo-captioned.mp4"
    style = "FontName=Helvetica Neue,FontSize=15,Outline=0,BorderStyle=4,BackColour=&H99000000,MarginV=36"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video),
                    "-vf", f"subtitles={srt}:force_style='{style}'", "-c:a", "copy", str(final)], check=True)
    ends = [start for _, start in take.clips[1:]] + [total]
    for (name, start), end in zip(take.clips, ends):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-to", f"{end:.2f}",
                        "-i", str(final), "-c:v", "libx264", "-crf", "18", "-c:a", "copy",
                        str(out / f"clip-{name}.mp4")], check=True)


# Main ----------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--storyboard", type=Path, default=HERE / "storyboard.yaml")
    parser.add_argument("--base-url", default=os.environ.get("DEMO_BASE_URL", "http://localhost:3000"))
    parser.add_argument("--out", type=Path, default=HERE / "out")
    parser.add_argument("--dry-run", action="store_true", help="walk the storyboard without recording or moving the real cursor")
    parser.add_argument("--headless", action="store_true", help="dry run only: no window at all (for CI)")
    args = parser.parse_args()
    if args.headless and not args.dry_run:
        parser.error("--headless only makes sense with --dry-run")
    if not args.dry_run and not OPENSCREEN.exists():
        parser.error(f"OpenScreen is not installed at {OPENSCREEN}")

    board = yaml.safe_load(args.storyboard.read_text())
    width, height = board.get("window", [1440, 900])
    env = {key: os.environ.get(key, str(default)) for key, default in board.get("env", {}).items()}
    args.out.mkdir(parents=True, exist_ok=True)
    project, video, srt = args.out / "demo.openscreen", args.out / "demo.mp4", args.out / "demo.srt"

    with sync_playwright() as playwright:
        # A persistent context is the only kind whose first window is the
        # `--app` window: no tabs or address bar in the picture. The profile
        # is thrown away each take, so every take starts signed out.
        profile = args.out / "profile"
        shutil.rmtree(profile, ignore_errors=True)
        context = playwright.chromium.launch_persistent_context(
            str(profile),
            headless=args.headless,
            args=[f"--app={args.base_url}", f"--window-size={width},{height}", "--window-position=80,60",
                  "--disable-infobars", "--hide-crash-restore-bubble"],
            no_viewport=not args.headless,
            viewport={"width": width, "height": height} if args.headless else None,
            color_scheme=board.get("theme", "dark"),
        )
        page = context.pages[0] if context.pages else context.new_page()
        cursor, take = Cursor(page, real=not args.dry_run), Take()

        # Everything before the camera rolls: signing in, clearing old data.
        for step in board.get("prelude", []):
            run_step(step, page, Cursor(page, real=False), take, args.base_url, env)

        recorder = None if args.dry_run else Recorder(project)
        if recorder:
            page.bring_to_front()
            recorder.start()
        take.started = time.monotonic()
        try:
            for number, step in enumerate(board["steps"], 1):
                print(f"[{take.now():6.1f}s] {number:>2}. {step}", flush=True)
                try:
                    run_step(step, page, cursor, take, args.base_url, env)
                except Exception:
                    # What the page looked like is usually the whole answer.
                    page.screenshot(path=str(args.out / "failure.png"))
                    print(f"Step {number} failed at {page.url}. See {args.out / 'failure.png'}.", file=sys.stderr)
                    raise
        finally:
            total = take.now()
            if recorder:
                recorder.stop()
            context.close()

    write_captions(take, srt)
    print(f"Storyboard finished in {total:.1f}s, {len(take.captions)} captions, {len(take.clips)} clips.")
    if recorder:
        export(project, video)
        burn_and_cut(video, srt, take, args.out, total)
        print(f"Video: {args.out / 'demo-captioned.mp4'}")


if __name__ == "__main__":
    sys.exit(main())
