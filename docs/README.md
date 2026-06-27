# DMS — Data Matrix Scanner

DMS is a pure client-side mobile web app for scanning and tracking Data Matrix codes. It runs entirely in the browser with no backend server, stores all data locally on your device, and works offline as a progressive web app (PWA).

## What it does

- **Scan Data Matrix codes** using your phone's rear camera (powered by the ZXing library, Data Matrix format only).
- **View decoded content** with a visual highlight polygon on the camera feed.
- **Keep a local history** of all scans in your device's IndexedDB database, with per-content counts.
- **Manage your history**: delete individual scans and undo the last deletion (one level deep).
- **Select and highlight** multiple history entries with long-press (visual-only, session-scoped).
- **Customize the app**: toggle between dark and light themes, hide duplicate entries, view database statistics, and clear all data.
- **Install as standalone**: add to your home screen and use offline after the first load.

## Target platforms

- **Chrome** and **Firefox** on mobile Android. (On iOS, PWA installation and offline features require Safari; third-party iOS browsers are WebKit-wrapped and do not support service-worker offline caching.)
- **Portrait orientation** (landscape not supported).
- Secure context required (HTTPS or localhost) for camera access.

## Module architecture

| Module | Purpose |
|--------|---------|
| `js/db.js` | IndexedDB persistence layer; CRUD operations and size estimation. |
| `js/store.js` | In-memory model of the scan history; per-content counts, undo buffer, and change events. |
| `js/settings.js` | localStorage wrapper for user settings (theme, hide duplicates). |
| `js/theme.js` | Apply dark/light theme by setting `data-theme` on the HTML root. |
| `js/scanner.js` | Initialise the rear camera, decode Data Matrix frames, and emit recognised content. |
| `js/ui/history-panel.js` | Render the scrollable history list with delete buttons and per-content counts. |
| `js/ui/options-menu.js` | Options overlay with theme selector, hide-duplicates toggle, database stats, and clear confirmation. |
| `js/ui/bottom-bar.js` | Render the undo footer (visible only when undo is available). |
| `js/util/format.js` | Timestamp and byte-size formatting utilities (formatTimestamp, formatBytes). |
| `js/app.js` | Application bootstrap; wire all modules together and manage the main render loop. |

## Running locally

### Prerequisites

- Node.js 16+
- Python 3 (for the simple HTTP server)

### Run tests

```bash
npm test
```

This runs all test suites: `format`, `db`, `store`, and `settings`. Tests use `node:test` with `fake-indexeddb` for mocking the browser's IndexedDB.

### Serve the app

```bash
npm run serve
```

This starts a Python HTTP server on port 8000. Open your browser to:

```
http://localhost:8000
```

**Note:** Camera access requires a secure context (HTTPS or localhost). The local server provides a secure context automatically.

### Development files

- `index.html` — Main HTML entry point.
- `css/styles.css` — Styling (dark and light themes).
- `manifest.webmanifest` — PWA manifest; enables installation and offline support.
- `sw.js` — Service worker for offline caching and standalone mode.
- `vendor/zxing/zxing.min.js` — Vendored ZXing library (Data Matrix decoding).
- `assets/icons/` — PWA app icons (192×192 and 512×512).

## On-device testing checklist

To fully verify the app on a real device, follow this manual checklist:

1. **Deploy** to a static HTTPS host (see [docs/deployment.md](./deployment.md)) or serve over LAN HTTPS.
2. **Camera permission**: Open the app and check that the browser prompts for camera access.
3. **Data Matrix detection**: Hold a Data Matrix code in front of the camera. Verify:
   - The camera feed briefly freezes.
   - A highlight polygon appears around the code.
   - The decoded content displays in an overlay.
   - Tapping the frozen view resumes live scanning.
   - A new history entry is created with the content and timestamp.
4. **History management**:
   - Tap the trash button next to an entry to delete it.
   - Verify the undo bar appears with "Undo delete" button.
   - Tap undo to restore the deleted entry.
   - Scan the same content twice; verify the counter increments instead of adding a duplicate.
5. **Long-press selection**: Long-press a history entry (should highlight it). Tap another entry while the first is highlighted; verify both are highlighted. Refresh the page; verify highlights are cleared.
6. **Theme and options**:
   - Tap the hamburger menu (☰) to open the options panel.
   - Switch between dark and light themes; verify the app re-themes.
   - Toggle "Hide duplicates" and verify the history updates.
   - Check "Database" stats (entry count and size in kB).
   - Tap "Clear database" and confirm the destructive action.
7. **PWA installation** (both Chrome and Firefox):
   - Open the app in Chrome: look for an install banner or tap the menu and select "Install app".
   - Verify it opens in standalone mode (no browser chrome) and appears on your home screen.
   - Close all browser tabs and reopen the app from the home screen icon.
   - Verify it loads and scans work offline (after the initial load populated the service worker cache).
8. **Repeat on both browsers** (Chrome and Firefox) and both portrait and landscape (if supported; portrait is primary).

## Architecture notes

- **No build step**: All JavaScript is vanilla ES modules. The app runs directly from the static files.
- **Pure client-side**: No backend API, no remote storage. All data stays on your device.
- **Offline-first**: The service worker caches all assets on first load, enabling offline use after that.
- **Persistent state**: Scan history is stored in IndexedDB; settings (theme, hide duplicates) are stored in localStorage.
- **Single-level undo**: Only the most recent deletion can be undone.

## Browser support

- Chrome/Chromium 80+
- Firefox 89+

Older browsers may lack support for IndexedDB, ES modules, or the Camera API.

## License

See the root LICENSE file or project documentation for licensing details.
