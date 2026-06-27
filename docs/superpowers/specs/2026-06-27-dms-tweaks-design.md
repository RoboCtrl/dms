# DMS Tweaks — Design

Date: 2026-06-27
Status: Approved (pre-implementation)
Branch: `dev-claude`

A batch of UI/UX tweaks to the Data Matrix Scanner: switch to Lucide icons,
add a camera on/off toggle and continuous-scan behaviour, refine the history
entry layout and content rendering, and polish the options panel.

## Goals

1. Replace the current emoji/HTML-entity icons with Lucide icons.
2. Let the user toggle the camera on/off, and keep the camera running after a
   detection instead of stopping it.
3. Improve scan ergonomics: a 50%-transparent frozen overlay, a placement
   reticle, and a same-content cooldown to avoid history flooding.
4. Refine the history entry layout and conditionally bold meaningful content.
5. Polish the options panel heading placement and About section.

## Non-goals

- No backend, build step, or remote dependencies (offline-first PWA constraint
  stands — everything ships as static files under `www/`).
- No changes to the storage schema, theming system, or deployment flow beyond
  what these features require.

---

## 1. Icons → Lucide (inline SVG)

Lucide ships as inline SVG (no icon font), chosen because the app needs only a
handful of icons and must work fully offline without loading a web font.

- **Vendored assets**: add the required Lucide SVGs under
  `www/assets/icons/lucide/`: `menu`, `x`, `trash-2`, `camera`, `camera-off`.
- **Helper**: new `www/js/util/icon.js` exporting a function that returns an
  `<svg>` element (or markup) for a given icon name. Icons use
  `stroke="currentColor"` so they inherit the surrounding theme colour, plus a
  consistent `stroke-width` and `width`/`height` driven by `1em`/font-size.
- **Replacements**:
  - Hamburger `&#9776;` (options/menu button) → `menu`
  - Close `&times;` (options panel) → `x`
  - Trash `🗑` (history entry) → `trash-2`
  - Camera toggle → `camera` (on) / `camera-off` (off)

## 2. Scanner

### Camera toggle button

- A new button placed immediately **left of the options button**, sharing a
  common size/style (e.g. a shared `.cam-ctrl` button class for both).
- Shows the `camera` icon when the camera is on, `camera-off` when off.
- Tapping toggles the camera.

### Camera off state

- When off: stop the media stream and display a **dark-gray fill** over the
  video area with a centred **white `camera-off` icon**.
- When toggled back on: restart the stream and resume the decode loop.

### Toggle persistence

- The on/off state persists in settings (`cameraOn`, default `true`), alongside
  the existing `theme` and `hideDuplicates` settings, so the choice survives a
  reload.

### Keep camera running after detect

- On detection, **do not** reset/stop the reader stream. Instead set a `frozen`
  flag that pauses *processing* of further results while the video element keeps
  streaming live underneath.

### Frozen overlay at 50%

- On detection, capture the current frame to the freeze canvas and render it at
  `opacity: 0.5` so the live feed shows through, with the green highlight polygon
  drawn on top and the recognised content shown.
- **Tap the camera panel to clear** the frozen overlay and resume processing of
  detections.

### Placement indicator

- A centred square **reticle** with accent-coloured corner brackets, always
  visible during live scanning, indicating where to position the Data Matrix
  code for recognition. Implemented as an overlay element (CSS or canvas);
  hidden while the camera is off.

### Same-content cooldown

- After recording a code, the same `content` is **not re-added** to history
  until a different code is detected or a short cooldown (~2s) elapses. Tracked
  via a `lastContent` value and timestamp in the recognise path. This prevents
  the continuous decode loop from flooding history with duplicates.

## 3. History entries

Layout stays a grid: `counter | (content over timestamp) | trash`.

- **Counter**: spans both rows, slightly larger font than now.
- **Top row (content)**: slightly taller than the timestamp row.
- **Bottom row**: timestamp.
- **Trash**: spans both rows, uses the Lucide `trash-2` icon.

### Conditional content rendering

A new helper in `www/js/util/format.js` decides how content is displayed:

- If content matches `^\d+\s+[A-Za-z0-9]+\s+\d+\s+\d+$` (an integer, an
  alphanumeric token, then two integers), render the four parts with **only the
  2nd token bold** and the other three parts in normal weight.
- Otherwise, render the whole content in **normal weight** (changed from the
  current all-bold rendering).

The helper returns structured output (e.g. an array of `{text, bold}` segments)
so `history-panel.js` can build the DOM without injecting raw HTML.

## 4. Options panel

- **Heading placement**: `Options` heading pinned to the top of the panel
  (`margin-top: 0`); the close button remains absolutely positioned at the
  top-right and no longer dictates the heading's vertical position.
- **About section**:
  - Add a `Data Matrix Scanner` line under the `About` heading, above the link.
  - Add a new `--link` theme variable: `#7FC1DF` (dark theme) / `#496E80`
    (light theme), applied to the link's `:link`, `:visited`, and `:active`
    states.

---

## Affected files

| File | Change |
| --- | --- |
| `www/assets/icons/lucide/*.svg` | New vendored Lucide SVGs |
| `www/js/util/icon.js` | New icon helper |
| `www/js/util/format.js` | New content-segmenting helper |
| `www/index.html` | Camera toggle button, camera-off element, reticle element, About text; icon markup |
| `www/css/styles.css` | `--link` var, camera controls, camera-off fill, reticle, frozen overlay opacity, entry layout, options heading, link colours |
| `www/js/scanner.js` | Camera toggle, keep-running-after-detect, 50% freeze, reticle visibility, cooldown |
| `www/js/ui/options-menu.js` | Wire camera toggle persistence if owned here |
| `www/js/settings.js` | New `cameraOn` setting |
| `www/js/ui/history-panel.js` | New entry layout + conditional content rendering |
| `www/sw.js` | Bump cache version; add new vendored icon assets to precache |

## Testing

- Unit-test the `format.js` segmenter: matching strings bold only the 2nd token;
  non-matching strings render normal weight; edge cases (extra whitespace,
  empty, non-matching shapes).
- Manual: camera toggle on/off and persistence across reload; continuous scan
  with frozen 50% overlay and tap-to-clear; cooldown prevents duplicate
  flooding; reticle visible while scanning; icons render in both themes; options
  heading/link colours in both themes.
