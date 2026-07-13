# Discard Animation Options & Motion Redesign — Design

Date: 2026-07-13
Status: Approved

Two additions to the frozen-frame discard ("fade-off") animation. First, the
animation becomes configurable: an on/off toggle and a duration slider in the
options panel under **Scanner**. Second, the motion itself changes: the frozen
frame darkens (0% → 50% darker) and slides down towards the bottom edge of the
camera panel while it shrinks and fades, with the movement slightly
accelerating.

## Current behavior

- `.discarding` (CSS on `#freeze` and `#overlay`) transitions
  `opacity: 1 → 0` and `transform: scale(1) → scale(0.85)` over a fixed
  800ms (ease-out). `transform-origin` is the detected code's center, set
  inline by `drawFreeze()` in `www/js/scanner.js`.
- `resume()` adds the class and arms an 850ms fallback timeout;
  `transitionend` (or the fallback) hides the layers. A re-freeze mid-flight
  removes the class, which snaps the layers back instantly.
- The animation is always on and its duration is hardcoded in CSS
  (`800ms`) and JS (`DISCARD_FALLBACK_MS = 850`).

## 1. Settings & presets

- `www/js/settings.js` — two new persisted keys with defaults matching
  today's behavior:
  - `discardAnimation: true` (boolean toggle) with `setDiscardAnimation()`;
  - `discardDuration: 1` (preset index) with `setDiscardDuration()`.
- `www/js/freeze.js` — new preset array, **shortest first** (slider runs
  short → long, unlike the freeze sliders):
  - `DISCARD_DURATION_VALUES = [400, 800, 1200, 1600]` (ms);
  - `DEFAULT_DISCARD_DURATION = 1` (→ 800ms).
  - `freezeConfigFromSettings()` gains two output fields:
    `discardAnimation: boolean` and `discardMs: number`, resolved with the
    existing out-of-range-index fallback (`resolve()`).

## 2. Options panel

Under the **Scanner** section in `www/index.html`, after the freeze-mode
fieldset, two new rows styled like the existing `opt-row` controls:

- **Fade-off animation** — checkbox (`#opt-discard-anim`).
- **Animation duration** — 4-position range slider (`#opt-discard-duration`,
  `min=0 max=3 step=1`), leftmost = 400ms, rightmost = 1600ms.

`www/js/ui/options-menu.js` syncs both controls in `open()` and persists
changes on input, calling `onSettingsChange()` — which already invokes the
scanner's `refreshFreezeConfig()`, so changes apply to the very next discard
without further plumbing. The duration slider stays enabled even when the
toggle is off (consistent with the freeze sliders, which stay active for
non-selected modes).

## 3. New discard motion

The `.discarding` CSS rule becomes (durations from a CSS custom property):

- `opacity: 1 → 0`, **linear**;
- `filter: brightness(1) → brightness(0.5)`, **linear** — the darkening —
  on `#freeze` only; the green highlight polygon (`#overlay`) fades and moves
  but does not dim;
- `transform: translateY(var(--discard-shift, 0px)) scale(0.85)` with a
  **mild ease-in** (`cubic-bezier(0.4, 0, 0.8, 0.6)`) — the downward slide
  with slight acceleration; the shrink is kept and shares the easing (one
  `transform` property, one timing function);
- every transition duration is `var(--discard-ms, 800ms)`.

Geometry: `drawFreeze()` already computes the mask center in panel CSS pixels
(`originX`/`originY` from `computeFreezeMask`). It additionally sets
`--discard-shift: (panelH − originY)px` inline on both layers, so at animation
end the Data Matrix center sits exactly on the camera panel's bottom edge
(`#camera-panel` clips overflow, so the frame slides out of view). The
translate is written before the scale in the transform list, so the shift is
not scaled down by the shrink.

Timing plumbing in `scanner.js`:

- `resume()` reads the freeze config; when `discardAnimation` is **off** it
  skips the class entirely and calls `endDiscard()` immediately (instant hide,
  the pre-animation behavior).
- When on, it sets `--discard-ms` on both layers from `discardMs` and arms
  the fallback timeout at `discardMs + 50`. The fixed `DISCARD_FALLBACK_MS`
  constant is replaced by this derived value.
- Interruption semantics are unchanged: removing `.discarding` (re-freeze or
  camera-off) snaps the layers back; `endDiscard()` stays idempotent.

## Cross-cutting

- `www/sw.js`: bump the cache version so deployed clients pick up the CSS/JS
  changes (no new files to precache).
- Tests (`node --test`):
  - `test/freeze.test.js`: `discardAnimation`/`discardMs` resolution,
    defaults, and out-of-range index fallback;
  - `test/settings.test.js`: new defaults and both setters.
- The visual result (darkening, slide, easing, toggle off, duration presets,
  interruption) is verified manually on mobile Chrome/Firefox, per existing
  practice. On Firefox/Android a full browser restart is needed after deploy
  to clear the stale service-worker cache.

## Trade-offs considered

- **Extend the CSS-transition mechanism (chosen) vs Web Animations API vs
  rAF**: the `.discarding` class plus custom properties keeps the proven
  cancel/interrupt logic intact; WAAPI still animates `transform` as a single
  property so it buys no per-effect easing, and rAF would re-implement timing
  for no benefit.
- **Shared easing for shrink + slide (chosen)** over splitting them across a
  wrapper element: scale and translate live in one `transform`, and a wrapper
  div around two canvases adds DOM and transform-origin complexity for a
  barely visible difference.
- **Darken via `filter: brightness()` (chosen)** over re-drawing the canvas
  darker per frame: the filter transitions declaratively with the same
  duration variable and is GPU-composited on mobile Chrome/Firefox.
- **Slider short → long (chosen, per user)** over the freeze sliders'
  longest-first convention: "right = more" matches slider intuition for a
  duration control.
- **Duration slider always enabled (chosen)** over disabling it when the
  toggle is off: matches how the freeze sliders behave for non-selected
  modes.
