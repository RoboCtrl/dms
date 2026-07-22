import { formatTimestamp, segmentContent } from "../util/format.js";
import { setIcon } from "../util/icon.js";

const LONG_PRESS_MS = 500;

/**
 * Create the history-panel renderer. Renders the visible scan entries and wires
 * per-entry interactions (delete via trash, highlight via long-press).
 * @param {object} opts
 * @param {HTMLElement} opts.root - Container element (#history).
 * @param {object} opts.store - The store instance (Task 3).
 * @param {object} opts.catalog - The catalog model; supplies displayFor().
 * @param {() => boolean} opts.getHideDuplicates - Current hide-duplicates setting.
 * @param {() => string} opts.getGroupMode - Current grouping mode.
 * @param {() => void} opts.onOpenCatalogOptions - Opens the options menu at the Database section.
 * @returns {{render: () => void}}
 */
export function createHistoryPanel({
  root,
  store,
  catalog,
  getHideDuplicates,
  getGroupMode,
  onOpenCatalogOptions,
}) {
  /**
   * Build a single entry row element for a record.
   * @param {{id:number, content:string, timestamp:number}} rec
   * @returns {HTMLElement}
   */
  function buildEntry(rec) {
    const el = document.createElement("div");
    el.className = "entry" + (store.isHighlighted(rec.id) ? " highlighted" : "");
    el.dataset.id = String(rec.id);

    // Left column: the per-content counter, right-aligned and sized for two digits.
    const left = document.createElement("span");
    left.className = "col-left";

    const counter = document.createElement("span");
    counter.className = "counter";
    counter.textContent = String(store.countFor(rec.content, getGroupMode()));
    left.appendChild(counter);

    // Center column: scanned content (upper) stacked over the timestamp (lower).
    const center = document.createElement("div");
    center.className = "col-center";

    const content = document.createElement("span");
    content.className = "content";
    const display = catalog.displayFor(rec.content);
    if (display) {
      // A catalog token matched: show its text in place of the scanned content.
      content.textContent = display;
    } else {
      // Render segments: bold first token, accent-colored last two chars.
      // Segments carry their own spacing, so no separators are inserted.
      const segments = segmentContent(rec.content);
      for (const seg of segments) {
        if (!seg.bold && !seg.accent) {
          content.appendChild(document.createTextNode(seg.text));
          continue;
        }
        const part = document.createElement(seg.bold ? "strong" : "span");
        if (seg.accent) part.classList.add("tok-accent");
        part.textContent = seg.text;
        content.appendChild(part);
      }
    }

    const ts = document.createElement("span");
    ts.className = "timestamp";
    ts.textContent = formatTimestamp(rec.timestamp);

    center.append(content, ts);

    // Right column: the delete (trash) control, centered within its column.
    const right = document.createElement("span");
    right.className = "col-right";

    const trash = document.createElement("button");
    trash.className = "trash";
    trash.setAttribute("aria-label", "Delete entry");
    setIcon(trash, "trash-2");
    trash.addEventListener("click", (e) => {
      e.stopPropagation();
      store.deleteEntry(rec.id);
    });
    right.appendChild(trash);

    attachLongPress(el, () => store.toggleHighlight(rec.id));

    el.append(left, center, right);
    return el;
  }

  /**
   * Build the "catalog is empty" note shown at the end of the entry list. The
   * note explains that no catalog has been imported yet and offers an inline
   * button that jumps straight to the Database section of the options menu.
   * @returns {HTMLElement}
   */
  function buildCatalogHint() {
    const el = document.createElement("div");
    el.className = "catalog-hint";

    const link = document.createElement("button");
    link.className = "link-btn";
    link.type = "button";
    link.textContent = "options menu";
    link.addEventListener("click", () => onOpenCatalogOptions());

    el.append(
      document.createTextNode("Data Catalog is empty. Import a Data Catalog via the "),
      link,
    );
    return el;
  }

  /**
   * Attach a long-press handler (pointer held LONG_PRESS_MS without moving).
   * @param {HTMLElement} el - Element to watch.
   * @param {() => void} onLongPress - Invoked when the press threshold is met.
   */
  function attachLongPress(el, onLongPress) {
    let timer = null;
    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    el.addEventListener("pointerdown", () => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        onLongPress();
      }, LONG_PRESS_MS);
    });
    for (const ev of ["pointerup", "pointerleave", "pointermove", "pointercancel"]) {
      el.addEventListener(ev, clear);
    }
  }

  return {
    /**
     * Re-render the full list from current store state. Entries come first; an
     * empty catalog appends the import hint after them.
     */
    render() {
      root.replaceChildren();
      for (const rec of store.getVisible(getHideDuplicates(), getGroupMode())) {
        root.appendChild(buildEntry(rec));
      }
      if (catalog.getEntries().length === 0) {
        root.appendChild(buildCatalogHint());
      }
    },
  };
}
