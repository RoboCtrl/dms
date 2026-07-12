# Freeze Radial Mask & Discard Animation — Design

Date: 2026-07-12
Status: Approved

A visual gimmick for the frozen scan frame. Instead of showing the whole
frozen frame at a flat 50% opacity over the live feed, the frame gets a
circular alpha mask centered on the detected Data Matrix: fully opaque at the
code, fading to fully transparent outward. When the freeze is discarded, the
frame shrinks slightly and fades out over 800ms instead of vanishing
instantly.

## Current behavior

- `#freeze` is a full-frame canvas; `drawFreeze()` in `www/js/scanner.js`
  copies the video frame onto it. A static CSS rule (`#freeze { opacity: 0.5 }`)
  makes the whole frame uniformly translucent.
- `#overlay` is a second canvas drawing the green highlight polygon around the
  recognized code, at full opacity.
- Both canvases sit inside `#camera-panel` with `object-fit: cover`, so the
  panel shows a center crop of the video frame.
- `resume()` hides both canvases (plus decoded-text bar and tap hint)
  instantly.

## 1. Radial alpha mask

Applied in `drawFreeze()` after the video frame is drawn onto the `#freeze`
canvas:

- **Mask center**: the centroid of the ZXing result polygon (average of the
  result points), already in canvas (video-pixel) coordinates.
- **Mask radius**: compute the *visible* video rect — the sub-rectangle of the
  video actually shown in the panel under `object-fit: cover` (derived from
  panel and video dimensions; same math family as `computeCropRegion`). Find
  the distance from the mask center to the **farthest visible corner**. The
  gradient reaches full transparency at **2/3 of that distance**.
- **Application**: fill the canvas with a radial gradient (alpha 1 at the
  center → alpha 0 at the radius) using
  `globalCompositeOperation = "destination-in"`, punching the falloff directly
  into the frame's alpha channel. Because `object-fit: cover` scales
  uniformly, a circle in canvas space renders as a circle on screen.
- The static `#freeze { opacity: 0.5 }` CSS rule is removed; the mask replaces
  it. The green polygon on `#overlay` stays fully opaque and unmasked.

## 2. Discard animation (800ms)

`resume()` no longer hides the freeze layers instantly:

- `transform-origin` on `#freeze` and `#overlay` is set to the mask center
  mapped to CSS pixels (computed once per freeze, at draw time).
- A `.discarding` class is added to both canvases; CSS transitions
  `transform: scale(1) → scale(0.85)` and `opacity: 1 → 0` over **800ms**
  (ease-out).
- On `transitionend` — with an 850ms `setTimeout` fallback in case the event
  never fires — both canvases are hidden and the class is removed.
- The decoded-text bar (`#scan-content`) and tap hint hide instantly, as
  today.
- The frame and polygon animate together as one object.

### Interruption

With short freeze delays a new recognition can land while the discard
animation is still running. In that case the animation is cancelled cleanly:
pending hide-timeout cleared, `.discarding` class removed, layers restored to
full scale/opacity, and the new frame drawn. The fallback timeout must never
hide a freshly drawn freeze.

Camera-off during the animation also cancels it and hides the layers
immediately (existing `resume()`-on-camera-off path).

## Components

- `www/js/util/freeze-mask.js` (new): pure geometry helpers —
  polygon centroid, visible-rect under cover-fit, farthest-corner distance,
  and video-to-CSS coordinate mapping for the transform origin. No DOM; fully
  unit-testable.
- `www/js/scanner.js`: `drawFreeze()` applies the gradient mask and records
  the transform origin; `resume()` runs the animated discard with
  interruption handling.
- `www/css/styles.css`: remove static `#freeze` opacity; add `.discarding`
  transition rules.
- `www/sw.js`: precache the new util module and bump the cache version on
  deploy.

## Testing

- Unit tests (`node --test`) for `freeze-mask.js`: centroid of point sets,
  visible-rect math for both letterboxed axes of cover-fit (wide video in
  tall panel and vice versa), farthest-corner radius, CSS coordinate mapping.
- The visual effect (mask rendering, animation timing, interruption) is
  verified manually on mobile Chrome/Firefox, consistent with the project's
  existing practice for DOM/visual behavior.

## Trade-offs considered

- **Canvas `destination-in` mask (chosen) vs CSS `mask-image`**: the result
  points are already in canvas coordinates, so the canvas approach needs no
  video-to-CSS mapping for the mask itself and keeps the effect in one draw
  call. CSS masks would need per-detection position/size mapping and get
  messy combined with the discard transition.
- **CSS transition for the discard (chosen) vs rAF-driven redraw**: CSS gives
  the shrink/fade for free with correct timing; a JS animation would mix
  animation state into the scan loop.
- **Farthest-visible-corner radius (chosen, per user)** over
  nearest-edge or fixed-size: a generous spotlight that always spans most of
  the view regardless of where the code sits.
- **Shrink towards the code center (chosen, per user)** over the panel
  center: ties the collapse visually to the scanned code.
