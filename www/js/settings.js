/**
 * Persistent user settings (theme, hide-duplicates, camera-on) backed by a Storage-like
 * object. Defaults to localStorage but accepts an injected storage for tests.
 */

const KEY = "dms.settings";
const DEFAULTS = {
  theme: "dark",
  hideDuplicates: true,
  groupMode: "firstToken",
  cameraOn: true,
  cameraHeight: 1,
  freezeMode: "auto",
  freezeTimer: 1,
  freezeTapDelay: 2,
  freezeAutoDelay: 2,
  importUrl: "",
};

/**
 * Create a settings accessor bound to a storage backend.
 * @param {{getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void}} [storage=localStorage]
 * @returns {object} The settings instance.
 */
export function createSettings(storage = localStorage) {
  /**
   * Read settings, merging stored values over defaults. Malformed JSON falls
   * back to defaults.
   * @returns {{theme:"dark"|"light", hideDuplicates:boolean, cameraOn:boolean, cameraHeight:number, freezeMode:"tap"|"timer"|"auto", freezeTimer:number, freezeTapDelay:number, freezeAutoDelay:number, importUrl:string}}
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
   * @param {Partial<{theme:"dark"|"light", hideDuplicates:boolean, cameraOn:boolean, cameraHeight:number, freezeMode:"tap"|"timer"|"auto", freezeTimer:number, freezeTapDelay:number, freezeAutoDelay:number, importUrl:string}>} patch
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
     * Set and persist the list-entry grouping mode.
     * @param {"full"|"firstToken"|"firstSuffix"|"secondToken"|"none"} mode
     */
    setGroupMode(mode) {
      update({ groupMode: mode });
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
    /**
     * Set and persist the active scanner freeze mode.
     * @param {"tap"|"timer"|"auto"} mode
     */
    setFreezeMode(mode) {
      update({ freezeMode: mode });
    },
    /**
     * Set and persist the timer-mode duration preset index.
     * @param {number} index - Index into the freeze-timer presets.
     */
    setFreezeTimer(index) {
      update({ freezeTimer: index });
    },
    /**
     * Set and persist the tap-mode post-resume cooldown preset index.
     * @param {number} index - Index into the tap-delay presets.
     */
    setFreezeTapDelay(index) {
      update({ freezeTapDelay: index });
    },
    /**
     * Set and persist the auto-mode absence-debounce preset index.
     * @param {number} index - Index into the auto-delay presets.
     */
    setFreezeAutoDelay(index) {
      update({ freezeAutoDelay: index });
    },
    /**
     * Set and persist the last manually entered catalog import URL.
     * @param {string} value - The URL, or an empty string.
     */
    setImportUrl(value) {
      update({ importUrl: value });
    },
  };
}
