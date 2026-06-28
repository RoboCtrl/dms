/**
 * Pure freeze-lifecycle state machine for the scanner. Decides when to start a
 * freeze after a recognition and when to clear it, per the selected mode, with
 * all timing driven by an injected `now` (ms) so it is fully unit-testable —
 * the DOM glue in scanner.js holds no timing logic. Time is fed frame-by-frame
 * via onResult; taps via onTap.
 *
 * Modes:
 *  - "tap":   stays frozen until onTap; after a tap, a post-resume cooldown
 *             (tapDelaySec) blocks the next freeze.
 *  - "timer": auto-unfreezes timerSec after the freeze began.
 *  - "auto":  stays frozen while the SAME code keeps being seen; unfreezes once
 *             that code has been absent (different code or none) for
 *             autoDelaySec.
 *
 * @param {{mode:string, timerSec:number, tapDelaySec:number, autoDelaySec:number}} config
 * @returns {{onResult:(content:string|null, now:number)=>("freeze"|"unfreeze"|"none"), onTap:(now:number)=>("unfreeze"|"none"), setConfig:(config:object)=>void, isFrozen:()=>boolean, reset:()=>void}}
 */
export function createFreezeController(config) {
  let { mode, timerSec, tapDelaySec, autoDelaySec } = config;

  let frozen = false;
  let frozenContent = null;
  let freezeStart = 0;
  let lastSeenSame = 0;
  let cooldownUntil = 0;

  /**
   * Clear the active freeze: resets `frozen` to false and `frozenContent` to
   * null. Does not touch cooldownUntil; call reset() for a full lifecycle reset.
   */
  function clear() {
    frozen = false;
    frozenContent = null;
  }

  return {
    /**
     * Feed one decode frame.
     * @param {string|null} content - Decoded code this frame, or null if none.
     * @param {number} now - Current time in ms.
     * @returns {"freeze"|"unfreeze"|"none"}
     */
    onResult(content, now) {
      if (!frozen) {
        if (content == null) return "none";
        if (now < cooldownUntil) return "none";
        frozen = true;
        frozenContent = content;
        freezeStart = now;
        lastSeenSame = now;
        return "freeze";
      }
      if (mode === "tap") return "none";
      if (mode === "timer") {
        if (now - freezeStart >= timerSec * 1000) {
          clear();
          return "unfreeze";
        }
        return "none";
      }
      // auto
      if (content === frozenContent) {
        lastSeenSame = now;
        return "none";
      }
      if (now - lastSeenSame >= autoDelaySec * 1000) {
        clear();
        return "unfreeze";
      }
      return "none";
    },

    /**
     * Handle a viewport tap. Only unfreezes in tap mode while frozen, arming
     * the post-resume cooldown.
     * @param {number} now - Current time in ms.
     * @returns {"unfreeze"|"none"}
     */
    onTap(now) {
      if (!frozen || mode !== "tap") return "none";
      clear();
      cooldownUntil = now + tapDelaySec * 1000;
      return "unfreeze";
    },

    /**
     * Replace the live configuration (e.g. when options change).
     * @param {{mode:string, timerSec:number, tapDelaySec:number, autoDelaySec:number}} next
     * @returns {void}
     */
    setConfig(next) {
      mode = next.mode;
      timerSec = next.timerSec;
      tapDelaySec = next.tapDelaySec;
      autoDelaySec = next.autoDelaySec;
    },

    /** @returns {boolean} Whether the scanner is currently frozen. */
    isFrozen() {
      return frozen;
    },

    /**
     * Fully reset freeze lifecycle state — clears the active freeze (via
     * clear()) and also zeroes the post-tap cooldown. Call this whenever the
     * camera is toggled off so the controller stays in sync with the scanner's
     * local frozen flag, which is also cleared on camera-off.
     * @returns {void}
     */
    reset() {
      clear();
      cooldownUntil = 0;
    },
  };
}
