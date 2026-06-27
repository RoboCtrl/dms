# Deployment

DMS is a static web app with no build step and no backend. Deployment is straightforward: copy your static files to any HTTPS-enabled hosting provider.

## What to deploy

Copy all project files **except**:

- `node_modules/` — Development dependency, not needed at runtime.
- `test/` — Test code, not needed in production.
- `claude-log/` — Internal development logs.
- `.claude/` — Local development configuration.
- `.superpowers/` — Superpowers task documentation.
- `.git/` — Version control, not needed in production.
- `.gitignore` — Git metadata.

Deploy:

- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `css/` — Stylesheet.
- `js/` — All application JavaScript modules.
- `vendor/` — Vendored ZXing library.
- `assets/` — App icons and other assets.

## Deployment targets

### GitHub Pages

1. Push your code to a GitHub repository.
2. In the repository settings, enable GitHub Pages with the branch containing your static files (usually `main` or a `docs/` directory).
3. GitHub Pages serves over HTTPS by default.
4. Access your app at `https://<username>.github.io/<repository>`.

### Netlify

1. Connect your GitHub repository in Netlify.
2. Set the publish directory to your project root (or a subdirectory if you've restructured).
3. Netlify automatically deploys and serves over HTTPS.

### Vercel

1. Connect your GitHub repository in Vercel.
2. Vercel auto-detects static sites and deploys with HTTPS enabled.

### Any static HTTPS host

For other hosting (AWS S3 + CloudFront, Cloudflare Pages, self-hosted nginx/Apache, etc.):

1. Copy the files listed above to your server.
2. **Ensure HTTPS is enabled** (required for camera access).
3. Serve `index.html` for all routes (single-page app).
4. Set appropriate cache headers (e.g., immutable for versioned assets, short TTL for `index.html`).

## Secure context requirement

**Camera access requires HTTPS.** Modern browsers block the Camera API (and other sensitive APIs) on insecure contexts. Even localhost HTTP is acceptable for local development, but any remote deployment must use HTTPS.

If your host is over HTTP:
- The app will load and display UI, but the scanner will fail with a camera permission error.
- To fix, enable HTTPS on your host or use a tunnelling service (e.g., ngrok) to serve over HTTPS during development.

## Service worker and offline support

The app includes a service worker (`sw.js`) that caches all static assets on first load. After the initial visit:

1. The app is available offline.
2. Returning visits load assets from cache first, then check for updates.
3. Scan data remains in IndexedDB and localStorage, persisting across browser sessions.

No additional configuration is needed for offline support to work.

### Updating the app after deployment

The service worker uses a **cache-first strategy** keyed on a fixed cache name in `sw.js` (default: `"dms-v1"`). Once users have cached the app, deploying new code will **not** reach them automatically. To force an update:

1. In `sw.js`, increment the `CACHE` constant (e.g., `"dms-v1"` → `"dms-v2"`).
2. When users next open the app, the service worker activate event will clear the old cache and fetch the new app shell.
3. Existing scan history in IndexedDB and settings in localStorage will persist across the update.

## Configuration

The app has no configuration files or environment variables. All settings (theme, hide duplicates) are user-configurable in the app UI and stored in the browser's localStorage.

The "About" link in the options panel currently points to `https://www.example.com`. Update this in `index.html` if needed.

## Troubleshooting

**Camera not working after deployment:**
- Ensure your host is HTTPS (not HTTP).
- Ensure your browser grants camera permission.

**Service worker not caching offline:**
- Clear your browser's cache and do a hard reload (`Ctrl+Shift+R` or `Cmd+Shift+R`).
- Check the browser's developer tools (Application > Service Workers) to verify registration.

**Permissions issues:**
- On Android, ensure the browser has camera permission in system settings.
- Some browsers require additional steps; consult your browser's documentation.
