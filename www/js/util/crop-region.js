/**
 * Map the on-screen placement reticle to a source-frame pixel rectangle,
 * reproducing CSS `object-fit: cover`. The reticle is a centered square whose
 * side is `fraction` of the panel width (matching `#reticle { width: 60% }`),
 * grown by `padCss` on-screen pixels on every side. The result is the region
 * of the raw camera frame that the displayed reticle covers, so the decoder
 * can be fed exactly that area instead of the whole frame.
 *
 * `cover` scales the video by `s = max(panelW/videoW, panelH/videoH)`, centers
 * it, and crops the overflow; offsets of the visible origin relative to the
 * source origin are `(panelDim - videoDim*s)/2` in display pixels. Each display
 * coordinate maps back to source pixels via `(d - offset) / s`. The returned
 * rect is integer-aligned (floor the top-left, ceil the bottom-right), clamped
 * to the frame, and never smaller than 1x1.
 *
 * @param {object} args
 * @param {number} args.panelW - Camera panel width in CSS pixels.
 * @param {number} args.panelH - Camera panel height in CSS pixels.
 * @param {number} args.videoW - Source frame width in pixels (video.videoWidth).
 * @param {number} args.videoH - Source frame height in pixels (video.videoHeight).
 * @param {number} args.fraction - Reticle side as a fraction of panel width (e.g. 0.6).
 * @param {number} args.padCss - Extra margin per side, in on-screen CSS pixels.
 * @returns {{sx:number, sy:number, sw:number, sh:number}} Integer source-pixel crop rect.
 */
export function computeCropRegion({ panelW, panelH, videoW, videoH, fraction, padCss }) {
  // Avoid degenerate cases with zero or negative dimensions.
  if (panelW <= 0 || panelH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(1, videoW), sh: Math.max(1, videoH) };
  }

  const s = Math.max(panelW / videoW, panelH / videoH);
  const offX = (panelW - videoW * s) / 2;
  const offY = (panelH - videoH * s) / 2;

  const side = fraction * panelW;
  const dLeft = (panelW - side) / 2 - padCss;
  const dTop = (panelH - side) / 2 - padCss;
  const dRight = (panelW + side) / 2 + padCss;
  const dBottom = (panelH + side) / 2 + padCss;

  // Map display coords back into source-frame pixels.
  const toSrcX = (d) => (d - offX) / s;
  const toSrcY = (d) => (d - offY) / s;

  const sx = clamp(Math.floor(toSrcX(dLeft)), 0, videoW);
  const sy = clamp(Math.floor(toSrcY(dTop)), 0, videoH);
  const ex = clamp(Math.ceil(toSrcX(dRight)), 0, videoW);
  const ey = clamp(Math.ceil(toSrcY(dBottom)), 0, videoH);

  return {
    sx,
    sy,
    sw: Math.max(1, ex - sx),
    sh: Math.max(1, ey - sy),
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
