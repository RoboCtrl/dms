# CLAUDE.md

Project-specific instructions for Claude. These complement the user's global
instructions (`~/.claude/CLAUDE.md`), which always apply.

## Project

**DMS** — a pure client-side web app (no backend) for scanning Data Matrix
codes with a phone camera, decoding them, and keeping a local history of scans.
Target: Chrome and Firefox on mobile, portrait orientation. Supports dark and
light themes.

## Tech constraints

- Pure front-end only. No server, no build-time secrets, no remote storage.
- Must run from static files and work on mobile Chrome + Firefox.
- All scan data is persisted locally on the device.

## Conventions

- Code and comments in American English; conversation in British English.
- Document functions in-code (purpose, args, types, return values).
- Project docs live in `./docs` (markdown). Specs live in
  `./docs/superpowers/specs/`.
- Per-prompt change logs live in `./claude-log` (git-ignored).
- Active developer branch: `dev-claude`.

## Status

Pre-implementation. Spec and plan being drafted.
