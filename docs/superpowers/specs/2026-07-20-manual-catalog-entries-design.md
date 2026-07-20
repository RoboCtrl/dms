# Manual catalog entries and stacked database buttons

Design for two changes to the options panel: vertical stacking of the database
action buttons, and a manual catalog-entry editor inside the Manage Database
overlay.

## Motivation

Catalog entries could only arrive by importing a file or loading a URL. Adding a
single token/label pair meant editing a catalog file elsewhere and re-importing
it. A small inline editor in the Manage Database overlay removes that detour.
The three database buttons sat on one line and crowded each other on a phone in
portrait, so they stack now.

## Database button layout

The three buttons — `Manage database`, `Load from URL ...`, `Import catalogs` —
are wrapped in a `.db-actions` container (`display: flex`,
`flex-direction: column`, `gap: 8px`). The `#catalog-files` list stays outside
the wrapper so it continues to render below the buttons.

## Manual catalog entries

A horizontal separator follows the `Delete selected` / `Clear all` buttons of
the Catalog entries section. Below it sits a list of editor rows, an optional
limit notice, and an `Add entries` button.

### Rows

Each row is a flex pair of text inputs: a token on the left, a display text on
the right. The editor starts with a single empty row. On every `input` event the
row list is re-synced so exactly one trailing empty row exists:

- If the last row has content, a fresh empty row is appended below it.
- If clearing a field leaves two empty trailing rows, the surplus is removed, so
  the editor never accumulates blank rows. At least one row always remains.
- At `MAX_MANUAL_ROWS` (100) no further row is appended; the notice "Entry limit
  reached — add these entries first." is shown in its place.

### Adding

`Add entries` converts the rows to catalog records and writes them:

- Rows whose token is empty or whitespace-only are dropped. Tokens and texts are
  trimmed; a blank text is omitted from the record.
- Every record gets `rn: -1`, marking it as manually added rather than imported.
- A token repeated across rows keeps the last row's value, so tokens stay unique.
- A record whose token already exists in the catalog **replaces** that entry in
  place, keeping its position in the list. Remaining records are appended.
- The merged set is written via `catalog.replaceAll()` — the catalog model's only
  write path. The editor then resets to a single empty row and the overlay
  re-renders its lists.

If no row yields a record, the button does nothing.

## Modules

| File | Role |
|------|------|
| `www/js/util/manual-catalog.js` | Pure logic: `buildManualEntries(rows)`, `mergeManualEntries(existing, manual)`, `MAX_MANUAL_ROWS`. DOM-free and unit-tested. |
| `www/js/ui/manual-entries.js` | Thin DOM wrapper: builds rows, syncs the trailing row, wires `Add entries`. Exposes `reset()`. |
| `www/js/ui/manage-db.js` | Creates the editor and calls `reset()` when the overlay opens; the editor's `onChange` is the overlay's existing `refresh()`. |

Keeping the editor in its own module stops `manage-db.js` from growing a third
responsibility.

## Testing

`test/manual-catalog.test.js` covers trimming, blank-token rejection, text
omission, the `rn: -1` marker, duplicate rows within one batch, in-place
replacement, appending, and input immutability. The DOM wrapper is verified
manually in the browser.

## Deployment note

`www/sw.js` bumps to `dms-v14` and lists both new files in `ASSETS`; without
that, clients keep the stale cached shell.

### Report Metadata

Report written by Opus 4.8 - 2026-07-20T00:00:00.

Claude Prompt:

> in the options panel:
> - in the database section the three buttons `Manage database`, `Load from URL ...`, and `Import catalogs`
>   should be stacked vertically, with padding between them.
> - in the `Manage Database` panel, at the end of `Catalog entries`, after the `Delete selected` and `Clear all`
>   buttons a horizontal separator should be placed. after that two text edit field should be placed in a row.
>   the left edit field allows the user to define a token to match against, while the right edit field allows to
>   set a display text. once the left text edit field is non-empty a new row with two edit boxes is played right
>   below the current row. this works recursively for up to 100 entries. if this maximum is reached, instead of
>   adding yet another row a text line appears instead stating that the limit has been reached and the entries
>   have to be added first.
>   below this row/these rows is a `Add entries` button. when the button is clicked the manual entries above are
>   added to the catalog and the existing rows are removed, resetting the panel to show a single row with two
>   empty edit boxes. the `rn` field is set to `-1` for entries that have been manually added like this.
