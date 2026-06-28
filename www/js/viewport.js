/**
 * Camera viewport height presets and the helper that applies them.
 *
 * The options panel exposes a 5-position slider; each position maps to one of
 * the flex-basis values below, which is written to the `--cam-height` CSS
 * custom property consumed by `#camera-panel` in styles.css. Index 3 (45%) is
 * the historical default; indices 0–2 are progressively shorter and index 4 is
 * taller.
 */

/** @type {string[]} Flex-basis heights for the camera panel, shortest first. */
export const CAMERA_HEIGHTS = ["25%", "33%", "39%", "45%", "60%"];

/** Index of the default camera-height preset (matches the original 45%). */
export const DEFAULT_CAMERA_HEIGHT = 3;

/**
 * Apply a camera-height preset by writing its flex-basis to the `--cam-height`
 * CSS variable on the document root. Out-of-range indices fall back to the
 * default preset so a malformed stored value cannot break the layout.
 * @param {number} index - Preset index (0–4) into {@link CAMERA_HEIGHTS}.
 */
export function applyCameraHeight(index) {
  const height = CAMERA_HEIGHTS[index] ?? CAMERA_HEIGHTS[DEFAULT_CAMERA_HEIGHT];
  document.documentElement.style.setProperty("--cam-height", height);
}
