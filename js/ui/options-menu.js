import { applyTheme } from "../theme.js";
import { formatBytes } from "../util/format.js";
import * as db from "../db.js";

/**
 * Create the options-menu controller. Manages the overlay's open/close state
 * and wires the theme select, hide-duplicates toggle, database stats, and the
 * clear-database action (guarded by a confirmation prompt).
 * @param {object} opts
 * @param {object} opts.store - The store instance (Task 3).
 * @param {object} opts.settings - The settings instance (Task 4).
 * @param {() => void} opts.onSettingsChange - Called after any change so the app re-renders.
 * @returns {{open: () => void}}
 */
export function createOptionsMenu({ store, settings, onSettingsChange }) {
  const overlay = document.getElementById("options");
  const closeBtn = document.getElementById("options-close");
  const menuBtn = document.getElementById("menu-btn");
  const themeSel = document.getElementById("opt-theme");
  const hideDup = document.getElementById("opt-hide-dup");
  const stats = document.getElementById("db-stats");
  const clearBtn = document.getElementById("clear-db-btn");

  /** Refresh the database entry-count and size readout. */
  async function refreshStats() {
    const { count, bytes } = await db.estimateSize();
    stats.textContent = `${count} entries · ${formatBytes(bytes)}`;
  }

  /** Open the overlay, syncing controls to current settings + stats. */
  function open() {
    const s = settings.get();
    themeSel.value = s.theme;
    hideDup.checked = s.hideDuplicates;
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

  clearBtn.addEventListener("click", async () => {
    if (!confirm("Delete all scanned entries? This cannot be undone.")) return;
    await store.clearAll();
    await refreshStats();
    onSettingsChange();
  });

  return { open };
}
