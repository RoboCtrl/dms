/**
 * Same-content cooldown gate for continuous scanning. Prevents the decode loop
 * from re-recording the same code many times per second: the same content is
 * only accepted again after a different code is seen or the cooldown elapses.
 * @param {number} [cooldownMs=2000] - Minimum gap before re-accepting identical content.
 * @returns {{accept: (content: string, now: number) => boolean}} The gate.
 */
export function createScanGate(cooldownMs = 2000) {
  let lastContent = null;
  let lastTime = 0;
  return {
    /**
     * Decide whether a sighting should be recorded.
     * @param {string} content - The decoded content.
     * @param {number} now - Current time in ms (e.g. Date.now()).
     * @returns {boolean} True if the sighting should be recorded.
     */
    accept(content, now) {
      if (content === lastContent && now - lastTime < cooldownMs) return false;
      lastContent = content;
      lastTime = now;
      return true;
    },
  };
}
