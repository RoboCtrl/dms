# Options panel & list-entry grouping — Design

## Overview

Two related changes to the DMS options overlay and the history list:

1. **Options panel polish** — lift the `Options` title, and keep the title + close
   button pinned while the panel body scrolls.
2. **List-entry grouping** — a new `List entries` options section that houses the
   existing `Hide duplicates` toggle and a new `Grouping mode` control. The
   grouping mode governs both the per-entry counter and the hide-duplicates
   collapse.
3. A **`Clear catalog`** action in the existing `Catalog` section.

## Goals / non-goals

- Goal: make grouping a single, well-defined key derived from scanned content,
  reused by the counter and the de-duplicated view.
- Goal: preserve today's exact-content behaviour as the default (`full` mode).
- Non-goal: changing how content is displayed, matched against the catalog, or
  persisted. Grouping is a view/derivation concern only; records are unchanged.

## 1. Options panel header (sticky + padding)

The `Options` `<h2>` and the close button move into a new `.options-header` bar
that lives inside the scrolling `.options-panel`.

- `.options-panel` loses its top padding: `padding: 0 16px 16px`. Vertical scroll
  stays on this container.
- `.options-header`: `position: sticky; top: 0`, opaque `background: var(--panel)`,
  flex row (title on the left, close button on the right), `padding-top: 4px`.
  This places the title 4px from the panel top (down from 16px — the requested
  12px lift) and keeps it visible while the body scrolls beneath it.
- `#options-close` stops being `position: absolute` and sits in the header flex
  instead. Its `id` and existing JS wiring (icon + click handler) are unchanged.
- The header background is opaque so scrolling content does not show through.

## 2. New `List entries` section

Inserted between the `Scanner` and `Database` `.opt-group` sections.

- **Move** the existing `Hide duplicates` `.opt-row` here (it currently sits near
  the top, above the `Scanner` group).
- **Add** a `Grouping mode` vertical radio group, styled after the existing
  `.opt-freeze` fieldset. Four options, in this order:

  | Value          | Label                        | Meaning                                                        |
  | -------------- | ---------------------------- | -------------------------------------------------------------- |
  | `full`         | Only group full matches      | Group only when the full content string matches (the default) |
  | `firstSuffix`  | Group on first token suffix  | Group entries whose first token's last two characters match    |
  | `secondToken`  | Group on second token        | Group entries whose second token matches                       |
  | `none`         | Never group                  | Every entry stands alone                                       |

## 3. Grouping logic

New pure helper module `www/js/util/grouping.js`:

```js
groupKey(content, mode) // → string | null
```

- `full` → the whole `content` string.
- `firstSuffix` → the last two characters of the first whitespace-delimited
  token; `null` if the first token has fewer than two characters or is absent.
- `secondToken` → the second whitespace-delimited token; `null` if absent.
- `none` → always `null`.

Token splitting reuses `contentWords` from `util/catalog-match.js` (splits on
`/\s+/`, drops empties). Unknown/undefined modes fall back to `full`.

A `null` key means **ungrouped**: the entry stands on its own even if another
entry has identical content. Ungrouped entries always have a counter of `1` and
are never collapsed by hide-duplicates.

### Store changes (`www/js/store.js`)

The store stays free of settings coupling; the mode is passed in, matching the
existing `getVisible(hideDuplicates)` convention.

- `getVisible(hideDuplicates, groupMode)` — newest-first. When `hideDuplicates`
  is true, keep the newest record per non-null group key; records with a `null`
  key are always kept.
- `countFor(content, groupMode)` — compute `groupKey(content, groupMode)`;
  return `1` when it is `null`, otherwise the number of mirrored records sharing
  that key.

With `groupMode === "full"` both methods reproduce today's exact-content
behaviour.

### History panel (`www/js/ui/history-panel.js`)

- Accept a `getGroupMode` getter alongside the existing `getHideDuplicates`.
- Pass the mode through to `store.getVisible(...)` and `store.countFor(...)`.

## 4. Settings & wiring

- `www/js/settings.js`: add `groupMode: "full"` to `DEFAULTS`, extend the
  type docs, and add a `setGroupMode(mode)` setter mirroring `setHideDuplicates`.
- `www/js/ui/options-menu.js`: read the moved `Hide duplicates` control and the
  new grouping radios; sync both to current settings in `open()`; wire changes
  to `settings.setHideDuplicates` / `settings.setGroupMode` followed by
  `onSettingsChange()`.
- `www/js/app.js`: pass `getGroupMode: () => settings.get().groupMode` into
  `createHistoryPanel`.

## 5. Clear catalog database

- Add a `Clear catalog` button (`#catalog-clear-btn`) to the `Catalog` section in
  `index.html`.
- `www/js/ui/catalog-section.js`: wire it behind a `confirm()` to the existing
  `catalog.clear()`, then `refreshStats()` and `onChange()` — mirroring the
  Database section's `Clear database` button.

## Testing

- **`test/grouping.test.js`** (new) — unit tests for `groupKey` across all four
  modes, including the `null` edge cases (short/absent first token, absent second
  token).
- **`test/store.test.js`** — update existing `countFor` / `getVisible` calls to
  pass `groupMode` (default `"full"` keeps assertions identical), and add cases
  for a non-`full` mode covering both counter and hide-duplicates collapse plus
  the ungrouped (`null` key) behaviour.
- **`test/settings.test.js`** — add coverage for the `groupMode` default and
  `setGroupMode`.

## Trade-offs considered

Passing `groupMode` as a method parameter (chosen) vs. making the store hold the
current mode. The parameter approach keeps the store decoupled from settings,
matches the existing `getVisible(hideDuplicates)` signature, and keeps the pure
grouping logic trivially testable in isolation.
