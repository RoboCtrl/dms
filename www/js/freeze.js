/**
 * Scanner freeze presets and the settings→config resolver.
 *
 * The options panel exposes one radio per freeze mode, each paired with a
 * 4-position slider. Each slider position maps to one of the second-values
 * below; settings persist the chosen index (like camera-height). This module
 * is pure (no DOM) so both the scanner and the options menu — and the unit
 * tests — share one source of truth. Index 0 is the longest duration so the
 * leftmost slider position is the longest, per the design.
 */

/** @type {number[]} Timer-mode durations in seconds, longest first. */
export const FREEZE_TIMER_VALUES = [5, 2, 1, 0.5];
/** @type {number[]} Tap-mode post-resume cooldowns in seconds, longest first. */
export const FREEZE_TAP_DELAY_VALUES = [2, 1, 0.5, 0];
/** @type {number[]} Auto-mode absence debounces in seconds, longest first. */
export const FREEZE_AUTO_DELAY_VALUES = [2, 1, 0.5, 0];

/** Default preset index for timer mode (→ 2s). */
export const DEFAULT_FREEZE_TIMER = 1;
/** Default preset index for tap mode (→ 0.5s). */
export const DEFAULT_FREEZE_TAP_DELAY = 2;
/** Default preset index for auto mode (→ 0.5s). */
export const DEFAULT_FREEZE_AUTO_DELAY = 2;

/** @type {string[]} Valid freeze modes. */
export const FREEZE_MODES = ["tap", "timer", "auto"];
/** Default freeze mode. */
export const DEFAULT_FREEZE_MODE = "auto";

/**
 * Resolve a preset index to its second-value, falling back to the preset at
 * `defaultIndex` when `index` is out of range. Keeps a malformed stored index
 * from producing `undefined` seconds.
 * @param {number[]} values - Preset value array.
 * @param {number} index - Stored preset index.
 * @param {number} defaultIndex - Fallback index into `values`.
 * @returns {number} The resolved seconds value.
 */
function resolve(values, index, defaultIndex) {
  return values[index] ?? values[defaultIndex];
}

/**
 * Build a freeze-controller config from a settings-shaped object, converting
 * the persisted preset indices into second-values the controller understands.
 * @param {{freezeMode:string, freezeTimer:number, freezeTapDelay:number, freezeAutoDelay:number}} s
 * @returns {{mode:string, timerSec:number, tapDelaySec:number, autoDelaySec:number}}
 */
export function freezeConfigFromSettings(s) {
  return {
    mode: FREEZE_MODES.includes(s.freezeMode) ? s.freezeMode : DEFAULT_FREEZE_MODE,
    timerSec: resolve(FREEZE_TIMER_VALUES, s.freezeTimer, DEFAULT_FREEZE_TIMER),
    tapDelaySec: resolve(FREEZE_TAP_DELAY_VALUES, s.freezeTapDelay, DEFAULT_FREEZE_TAP_DELAY),
    autoDelaySec: resolve(FREEZE_AUTO_DELAY_VALUES, s.freezeAutoDelay, DEFAULT_FREEZE_AUTO_DELAY),
  };
}
