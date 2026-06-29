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
 * @returns {{render: () => void}}
 */
export function createHistoryPanel({ root, store, catalog, getHideDuplicates }) {
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
    counter.textContent = String(store.countFor(rec.content));
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
      // Render segments: only the special-format alphanumeric token is bold.
      const segments = segmentContent(rec.content);
      segments.forEach((seg, i) => {
        if (i > 0) content.appendChild(document.createTextNode(" "));
        if (seg.bold) {
          const strong = document.createElement("strong");
          strong.textContent = seg.text;
          content.appendChild(strong);
        } else {
          content.appendChild(document.createTextNode(seg.text));
        }
      });
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
    /** Re-render the full list from current store state. */
    render() {
      root.replaceChildren();
      for (const rec of store.getVisible(getHideDuplicates())) {
        root.appendChild(buildEntry(rec));
      }
    },
  };
}
