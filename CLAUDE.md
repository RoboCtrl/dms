# CLAUDE.md

Project-specific instructions for Claude. These complement the user's global
instructions (`~/.claude/CLAUDE.md`), which always apply.

## Project

**DMS** — a pure client-side web app (no backend) for scanning Data Matrix
codes with a phone camera, decoding them, and keeping a local history of scans.
Installable as a PWA and usable offline. A local **catalog** maps tokens found
in scanned content to a human-readable label and image, so entries show what a
code actually is; catalog files can be imported from a URL. Target: Chrome and
Firefox on mobile Android, portrait orientation. Supports dark and light themes.

## Tech constraints

- Pure front-end only. No server, no build-time secrets, no remote storage.
- No build step: vanilla ES modules, served as-is.
- Must run from static files and work on mobile Chrome + Firefox.
- All scan data and catalog entries are persisted locally on the device
  (IndexedDB); user settings live in localStorage.
- The only network access at runtime is the optional catalog import fetch.

## Conventions

- Code and comments in American English; conversation in British English.
- Document functions in-code (purpose, args, types, return values).
- Project docs live in `./docs` (markdown). Specs live in
  `./docs/superpowers/specs/`, implementation plans in
  `./docs/superpowers/plans/`.
- `./README.md` is the user-facing manual; `./docs/README.md` is the developer
  overview (module map, local dev, test checklist).
- Tests live in `./test` and run with `npm test` (`node:test`, no framework).
  Pure logic goes in `www/js/util/` so it stays unit-testable without a DOM.
- Per-prompt change logs live in `./claude-log` (git-ignored).
- Active developer branch: `dev-claude`.

## Versioning

The About section of the options panel (`www/index.html`, `.about-name`) shows
`Data Matrix Scanner, Version: <tag>` and must always match the latest git tag.
**Bump it in the same commit that is about to be tagged, before creating the
tag** — otherwise the tagged tree carries a stale version and a second commit
(and redeploy) is needed just to correct it. Tags are plain semver without a
`v` prefix, e.g. `1.0.1`. Bumping the version is a runtime change, so also bump
`CACHE` in `www/sw.js`.

## Deployment

The app ships as static files. The entire runtime lives in the **`www/`**
folder — that folder alone is everything a web server needs to serve the app.
Everything outside `www/` (tests, docs, tooling, `package.json`) is
development-only and never deployed.

Deployment is two steps: push source to GitHub, then update the copy on the VPS
that nginx serves.

> Credentials (VPS host/user/password, GitHub PAT) live in the git-ignored
> `./.secret` file — never commit them or paste them into tracked files.

### 1. Push to GitHub (origin)

- Origin: `git@github.com:RoboCtrl/dms.git` (private).
- Develop on `dev-claude`; the VPS serves `main`, so changes must reach `main`
  to go live.

```bash
# on the dev machine
git checkout dev-claude
git add -A && git commit -m "…"        # per-prompt commit (see global rules)
git push origin dev-claude

# promote to main (direct merge shown; a PR is fine too)
git checkout main
git merge --ff-only dev-claude
git push origin main
```

### 2. Deploy to the VPS

- Server: `srv346879.hstgr.cloud` (Ubuntu 24.04), nginx + Let's Encrypt HTTPS.
- Live URL: `https://srv346879.hstgr.cloud/app/`
- Repo clone: `/opt/repos/dms`
- Served via symlink: `/var/www/html/app` → `/opt/repos/dms/www` (folder symlink
  to the runtime subfolder, so a `git pull` updates the live site instantly — no
  copying). Pointing the symlink at `www/` means repo internals (`.git/`,
  `CLAUDE.md`, `package.json`, …) are never reachable over the web.

```bash
ssh root@srv346879.hstgr.cloud          # password in ./.secret
cd /opt/repos/dms
git pull origin main

# one-time, after the move to www/: re-point the symlink at the runtime folder
ln -sfn /opt/repos/dms/www /var/www/html/app
```

Notes:

- The clone's `origin` is the token-free HTTPS URL, so `git pull` will ask for
  credentials. Authenticate with the GitHub PAT from `./.secret`, or set up a
  read-only **deploy key** on the server for frictionless pulls.
- Because the symlink targets `www/` (web assets only), repo internals are no
  longer in the served tree. The `/etc/nginx/snippets/deny-sensitive.conf` rules
  remain as defense-in-depth, but keep web assets out of those denied patterns.
- No build step — committed files are served as-is. After changing any runtime
  file, bump the cache version in `www/sw.js` (`const CACHE = "dms-vN"`) and add
  any new file to its `ASSETS` list, otherwise clients keep the stale copy.
- On Firefox for Android a plain reload is not enough to pick up a new service
  worker — the browser has to be fully restarted.
- `www/data/` is served over the web (nginx autoindex) and is the source the
  in-app catalog import lists and fetches from
  (`CATALOG_BASE_URL` in `www/js/catalog-import.js`).

## Status

Implemented and live. The scanner, history, grouping, freeze modes, options
panel, Manage Database overlay, and catalog import are all in place; 114 unit
tests pass via `npm test`. Work continues as incremental feature batches, each
with a spec and plan under `./docs/superpowers/`.
