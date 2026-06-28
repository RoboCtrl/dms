/**
 * Persistent user settings (theme, hide-duplicates, camera-on) backed by a Storage-like
 * object. Defaults to localStorage but accepts an injected storage for tests.
 */

const KEY = "dms.settings";
const DEFAULTS = { theme: "dark", hideDuplicates: false, cameraOn: true, cameraHeight: 3 };

/**
 * Create a settings accessor bound to a storage backend.
 * @param {{getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void}} [storage=localStorage]
 * @returns {object} The settings instance.
 */
export function createSettings(storage = localStorage) {
  /**
   * Read settings, merging stored values over defaults. Malformed JSON falls
   * back to defaults.
   * @returns {{theme:"dark"|"light", hideDuplicates:boolean, cameraOn:boolean, cameraHeight:number}}
   */
  function get() {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  /**
   * Persist a partial update merged over current settings.
   * @param {Partial<{theme:"dark"|"light", hideDuplicates:boolean, cameraOn:boolean, cameraHeight:number}>} patch
   */
  function update(patch) {
    storage.setItem(KEY, JSON.stringify({ ...get(), ...patch }));
  }

  return {
    get,
    /**
     * Set and persist the active theme.
     * @param {"dark"|"light"} theme
     */
    setTheme(theme) {
      update({ theme });
    },
    /**
     * Set and persist the hide-duplicates preference.
     * @param {boolean} value
     */
    setHideDuplicates(value) {
      update({ hideDuplicates: value });
    },
    /**
     * Set and persist whether the camera is on.
     * @param {boolean} value
     */
    setCameraOn(value) {
      update({ cameraOn: value });
    },
    /**
     * Set and persist the camera viewport height preset index (0–4).
     * @param {number} value - Index into the camera-height presets.
     */
    setCameraHeight(value) {
      update({ cameraHeight: value });
    },
  };
}
