import { applyTheme } from "../theme.js";
import { applyCameraHeight } from "../viewport.js";
import { formatBytes } from "../util/format.js";
import { setIcon } from "../util/icon.js";
import * as db from "../db.js";

/**
 * Create the options-menu controller. Manages the overlay's open/close state
 * and wires the theme select, hide-duplicates toggle, list-entry grouping-mode
 * radios, camera viewport height slider, Scanner freeze radio+slider controls,
 * fade-off animation toggle, animation duration slider, and database stats.
 * The clear-database action has moved to the Manage Database overlay.
 * @param {object} opts
 * @param {object} opts.store - The store instance (Task 3).
 * @param {object} opts.settings - The settings instance (Task 4).
 * @param {() => void} opts.onSettingsChange - Called after any change so the app re-renders.
 * @returns {{open: () => void, refreshStats: () => Promise<void>}}
 */
export function createOptionsMenu({ store, settings, onSettingsChange }) {
  const overlay = document.getElementById("options");
  const closeBtn = document.getElementById("options-close");
  const menuBtn = document.getElementById("menu-btn");
  const themeSel = document.getElementById("opt-theme");
  const hideDup = document.getElementById("opt-hide-dup");
  const camHeight = document.getElementById("opt-cam-height");
  const freezeRadios = overlay.querySelectorAll('input[name="freeze-mode"]');
  const freezeTimer = document.getElementById("opt-freeze-timer");
  const freezeTap = document.getElementById("opt-freeze-tap");
  const freezeAuto = document.getElementById("opt-freeze-auto");
  const discardAnim = document.getElementById("opt-discard-anim");
  const discardDuration = document.getElementById("opt-discard-duration");
  const groupRadios = overlay.querySelectorAll('input[name="group-mode"]');
  const listStats = document.getElementById("db-list-stats");
  const sizeStats = document.getElementById("db-size-stats");

  setIcon(menuBtn, "menu");
  setIcon(closeBtn, "x");

  /** Refresh the list-entry count and storage-size readouts. */
  async function refreshStats() {
    const { count, bytes } = await db.estimateSize();
    listStats.textContent = `${count} list entries`;
    sizeStats.textContent = `${formatBytes(bytes)} storage size`;
  }

  /** Open the overlay, syncing controls to current settings + stats. */
  function open() {
    const s = settings.get();
    themeSel.value = s.theme;
    hideDup.checked = s.hideDuplicates;
    camHeight.value = String(s.cameraHeight);
    for (const radio of freezeRadios) {
      radio.checked = radio.value === s.freezeMode;
    }
    freezeTimer.value = String(s.freezeTimer);
    freezeTap.value = String(s.freezeTapDelay);
    freezeAuto.value = String(s.freezeAutoDelay);
    discardAnim.checked = s.discardAnimation;
    discardDuration.value = String(s.discardDuration);
    for (const radio of groupRadios) {
      radio.checked = radio.value === s.groupMode;
    }
    refreshStats();
    overlay.hidden = false;
  }

  /** Close the overlay. */
  function close() {
    overlay.hidden = true;
  }

  menuBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  themeSel.addEventListener("change", () => {
    settings.setTheme(themeSel.value);
    applyTheme(themeSel.value);
    onSettingsChange();
  });

  hideDup.addEventListener("change", () => {
    settings.setHideDuplicates(hideDup.checked);
    onSettingsChange();
  });

  camHeight.addEventListener("input", () => {
    const index = Number(camHeight.value);
    settings.setCameraHeight(index);
    applyCameraHeight(index);
    onSettingsChange();
  });

  for (const radio of freezeRadios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      settings.setFreezeMode(radio.value);
      onSettingsChange();
    });
  }

  for (const radio of groupRadios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      settings.setGroupMode(radio.value);
      onSettingsChange();
    });
  }

  freezeTimer.addEventListener("input", () => {
    settings.setFreezeTimer(Number(freezeTimer.value));
    onSettingsChange();
  });

  freezeTap.addEventListener("input", () => {
    settings.setFreezeTapDelay(Number(freezeTap.value));
    onSettingsChange();
  });

  freezeAuto.addEventListener("input", () => {
    settings.setFreezeAutoDelay(Number(freezeAuto.value));
    onSettingsChange();
  });

  discardAnim.addEventListener("change", () => {
    settings.setDiscardAnimation(discardAnim.checked);
    onSettingsChange();
  });

  discardDuration.addEventListener("input", () => {
    settings.setDiscardDuration(Number(discardDuration.value));
    onSettingsChange();
  });

  return { open, refreshStats };
}
