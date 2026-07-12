/**
 * Pure geometry for the frozen-frame radial mask and its discard animation.
 * Given the detected code's result points (video-pixel coordinates) and the
 * panel/video dimensions, computes everything the scanner needs to render the
 * effect: the mask center (polygon centroid), the gradient radius, and the
 * CSS-pixel transform-origin the freeze layers shrink towards on discard.
 *
 * The radius is 2/3 of the distance from the centroid to the farthest corner
 * of the *visible* part of the video — the sub-rectangle actually shown in
 * the panel under CSS `object-fit: cover` (scale
 * `s = max(panelW/videoW, panelH/videoH)`, centered, overflow cropped; same
 * mapping as crop-region.js). Because `cover` scales uniformly, a circle in
 * video pixels renders as a circle on screen.
 */

/** Fraction of the centroid→farthest-visible-corner distance at which the
 * mask reaches full transparency. */
const FALLOFF_FRACTION = 2 / 3;

/**
 * Compute the radial-mask geometry for a frozen frame.
 * Degenerate panel dimensions (<= 0) fall back to treating the full frame as
 * visible with an identity CSS mapping. `points` must be non-empty.
 * @param {object} args
 * @param {Array<{x:number, y:number}>} args.points - Detected code polygon in video pixels.
 * @param {number} args.panelW - Camera panel width in CSS pixels.
 * @param {number} args.panelH - Camera panel height in CSS pixels.
 * @param {number} args.videoW - Source frame width in pixels (video.videoWidth).
 * @param {number} args.videoH - Source frame height in pixels (video.videoHeight).
 * @returns {{cx:number, cy:number, radius:number, originX:number, originY:number}}
 *   Mask center and gradient radius in video pixels (radius >= 1), and the
 *   transform-origin in panel CSS pixels.
 */
export function computeFreezeMask({ points, panelW, panelH, videoW, videoH }) {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  // cover-fit mapping and visible source rect (full frame when degenerate).
  let s = 1;
  let offX = 0;
  let offY = 0;
  let left = 0;
  let top = 0;
  let right = videoW;
  let bottom = videoH;
  if (panelW > 0 && panelH > 0) {
    s = Math.max(panelW / videoW, panelH / videoH);
    offX = (panelW - videoW * s) / 2;
    offY = (panelH - videoH * s) / 2;
    left = clamp(-offX / s, 0, videoW);
    top = clamp(-offY / s, 0, videoH);
    right = clamp((panelW - offX) / s, 0, videoW);
    bottom = clamp((panelH - offY) / s, 0, videoH);
  }

  let farthest = 0;
  for (const [x, y] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ]) {
    farthest = Math.max(farthest, Math.hypot(x - cx, y - cy));
  }

  return {
    cx,
    cy,
    radius: Math.max(1, FALLOFF_FRACTION * farthest),
    originX: cx * s + offX,
    originY: cy * s + offY,
  };
}

/**
 * Clamp a number to an inclusive range.
 * @param {number} v - Value.
 * @param {number} lo - Lower bound.
 * @param {number} hi - Upper bound.
 * @returns {number} `v` confined to `[lo, hi]`.
 */
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
