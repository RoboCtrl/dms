# Scanner Freeze Modes — Design

**Date:** 2026-06-28
**Status:** Approved (brainstorming), pending implementation plan
**Component:** Scanner / Options menu

## Summary

Make the scanner's post-recognition "freeze" behaviour configurable. Today the
scanner freezes after recognising a Data Matrix and only resumes when the user
taps the viewport. This adds two more behaviours and a new **Scanner** section
in the options menu to choose between them. The new default is automatic
unfreeze once the recognised code leaves the frame.

## Background

Current behaviour (`www/js/scanner.js`):

- The camera stream runs continuously; recognition only pauses result
  *processing* (`frozen` flag), it never stops the stream.
- On recognition: record the scan, draw the frozen frame + green highlight
  polygon, show the decoded content. The freeze clears when the user taps
  anywhere on `#camera-panel` (ignoring the control buttons).
- A same-content cooldown gate (`www/js/util/scan-gate.js`, 2000 ms) throttles
  duplicate recordings.

Relevant existing patterns this design reuses:

- **Preset arrays + index in settings:** `www/js/viewport.js` defines
  `CAMERA_HEIGHTS` and `applyCameraHeight(index)`; `settings.js` stores the
  index (`cameraHeight`).
- **Pure, time-injected logic units:** `scan-gate.js` takes `now` as a
  parameter and is unit-tested with `node --test`.

## Freeze modes

Exactly one mode is active at a time (`freezeMode`). In every mode, "freeze"
means: record the scan, draw the frozen frame + highlight, and pause recording
of further scans until the mode's resume condition is met. The camera stream
keeps running in all modes (as today).

For all modes, **"delay X"** means: after the resume trigger fires, wait X
seconds before the detector is allowed to record the next matrix (a post-resume
cooldown). During that cooldown the detector may keep running but its results
are ignored.

### `tap` — Tap to continue (legacy +)

- Stays frozen until the user taps the viewport (`#camera-panel`, ignoring
  control buttons), exactly like today.
- While frozen, a hint `Tap to continue scanning` is shown near the bottom of
  the viewport: white text, black outline, horizontally centred.
- On tap: clear the freeze, wait `freezeTapDelay` seconds (post-resume
  cooldown), then resume recording.
- Slider: **Tap to continue, delayed by** — values `2s, 1s, 0.5s, 0s`,
  default `0.5s`.

### `timer` — Continue after

- Auto-resumes `freezeTimer` seconds after freezing. No tap required.
- Slider: **Continue after:** — values `5s, 2s, 1s, 0.5s`, default `2s`.

### `auto` — Automatic unfreeze (default)

- Detection keeps running in the background while frozen.
- As long as the **same** code (the one that caused the freeze) keeps being
  seen, the scanner stays frozen.
- "Absent" means the same code is not seen in a frame — this includes both *no
  code detected* and *a different code detected*. A different code does **not**
  keep the freeze alive.
- Once the recognised code has been absent continuously for `freezeAutoDelay`
  seconds, unfreeze and resume normal detection. A different code already in
  view is recorded only after unfreeze (never while frozen).
- Slider: **Automatic unfreeze, delayed by:** — values `2s, 1s, 0.5s, 0s`,
  default `0.5s`.

## Settings

New keys in `www/js/settings.js` (`DEFAULTS`), stored as **preset indices**
(consistent with `cameraHeight`), with new setter methods mirroring the existing
ones:

| Key | Meaning | Preset values (index 0→last) | Default index | Default value |
|-----|---------|------------------------------|---------------|---------------|
| `freezeMode` | active mode | `"tap" \| "timer" \| "auto"` | — | `"auto"` |
| `freezeTimer` | `timer` duration | `[5, 2, 1, 0.5]` | 1 | 2s |
| `freezeTapDelay` | `tap` post-resume cooldown | `[2, 1, 0.5, 0]` | 2 | 0.5s |
| `freezeAutoDelay` | `auto` absence debounce | `[2, 1, 0.5, 0]` | 2 | 0.5s |

Each mode keeps its own slider value independently, so switching modes preserves
prior choices. Slider direction matches the spec listing: leftmost position =
longest duration, rightmost = shortest.

Preset arrays and a small accessor live in a new `www/js/freeze.js` (analogous
to `viewport.js`), so both the controller and the options menu read the same
source of truth. Out-of-range stored indices fall back to the default index.

## Testable core: `freeze-controller.js`

New pure unit `www/js/util/freeze-controller.js`, time injected as a parameter
(like `scan-gate.js`). It owns all freeze lifecycle/timing state and exposes a
small interface so `scanner.js` stays thin glue. Proposed shape (final names
settled during planning):

- `createFreezeController({ mode, timerSec, tapDelaySec, autoDelaySec })`
- `onRecognized(content, now)` → returns whether a fresh freeze should start
  (respects the post-resume cooldown so a scan during cooldown is ignored).
- `onTap(now)` → for `tap` mode: clears freeze, starts the post-resume cooldown.
- `tick(seenContent, now)` → called per detector frame / animation tick;
  returns whether the scanner should unfreeze now. Drives `timer` auto-resume
  and `auto` absence-debounce logic. `seenContent` is the code seen this frame
  (or `null` for none).
- `isFrozen()` / `isCoolingDown(now)` as needed by the glue.

`scanner.js` keeps the DOM work (`drawFreeze`, `resume`, tap-hint show/hide,
camera on/off) and delegates all timing decisions to the controller. The
existing `scan-gate` remains for same-content duplicate suppression during
`auto`-mode background detection.

## Options menu

In `www/index.html`, a new **Scanner** section (`<h3>Scanner</h3>`) is inserted
after the **Hide duplicates** row and before the **Database** section:

1. **Camera viewport height** — the existing row, moved into this section.
2. **Scanner freeze** — three radio rows (one per mode), each with its label
   and its slider on the same row:
   - `Continue after:` + slider (`freezeTimer`)
   - `Tap to continue, delayed by` + slider (`freezeTapDelay`)
   - `Automatic unfreeze, delayed by:` + slider (`freezeAutoDelay`)

`www/js/ui/options-menu.js` wires the controls: selecting a radio sets
`freezeMode` and reconfigures the live scanner; each slider sets its own preset
index. `open()` syncs radios + sliders to current settings. Styling for the new
section and the radio/slider rows goes in `www/css/styles.css`, following the
existing `.opt-row` / `.opt-group` patterns. The tap hint gets a new element in
`#camera-panel` with white-text/black-outline styling (CSS `text-shadow`).

## Testing

- `test/freeze-controller.test.js` (new): all three modes — `tap` resume +
  cooldown, `timer` auto-resume timing, `auto` "same code keeps frozen" and
  "absent for N seconds unfreezes" including the different-code-counts-as-absent
  case, and post-resume cooldown ignoring scans.
- `test/settings.test.js` (extend): new keys, defaults, and setters round-trip.
- DOM wiring (options menu, scanner glue) is not unit-tested, consistent with
  the current codebase.

## Out of scope

- No change to how scans are stored, displayed, or de-duplicated in history.
- No change to camera on/off, theme, or viewport-height behaviour beyond moving
  the height row into the new Scanner section.
- No new persistence backend; settings stay in `localStorage`.
