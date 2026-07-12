/**
 * Application bootstrap. Wires persistence, the in-memory store, settings,
 * theming, the UI panels, and the scanner together, and re-renders the UI on
 * every store change.
 */
import * as db from "./db.js";
import { createStore } from "./store.js";
import { createSettings } from "./settings.js";
import { applyTheme } from "./theme.js";
import { applyCameraHeight } from "./viewport.js";
import { createHistoryPanel } from "./ui/history-panel.js";
import { createOptionsMenu } from "./ui/options-menu.js";
import { createBottomBar } from "./ui/bottom-bar.js";
import { createScanner } from "./scanner.js";
import { createCatalog } from "./catalog.js";
import { createCatalogSection } from "./ui/catalog-section.js";

/** Initialize and start the application. */
async function main() {
  const settings = createSettings();
  applyTheme(settings.get().theme);
  applyCameraHeight(settings.get().cameraHeight);

  const store = createStore(db);
  await store.load();

  const catalog = createCatalog(db);
  await catalog.load();

  const scanner = createScanner({
    onRecognized: (content) => store.recordScan(content),
    settings,
  });

  const history = createHistoryPanel({
    root: document.getElementById("history"),
    store,
    catalog,
    getHideDuplicates: () => settings.get().hideDuplicates,
    getGroupMode: () => settings.get().groupMode,
  });
  const bottomBar = createBottomBar({ store });
  createOptionsMenu({
    store,
    settings,
    onSettingsChange: () => {
      render();
      scanner.refreshFreezeConfig();
    },
  });
  createCatalogSection({ catalog, settings, onChange: render });

  /** Re-render all store-driven UI. */
  function render() {
    history.render();
    bottomBar.render();
  }

  store.on("change", render);
  catalog.on("change", render);
  render();

  await scanner.start();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline support is optional; ignore registration failures.
    });
  }
}

main();
