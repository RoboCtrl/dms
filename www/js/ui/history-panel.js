import { formatTimestamp } from "../util/format.js";

const LONG_PRESS_MS = 500;

/**
 * Create the history-panel renderer. Renders the visible scan entries and wires
 * per-entry interactions (delete via trash, highlight via long-press).
 * @param {object} opts
 * @param {HTMLElement} opts.root - Container element (#history).
 * @param {object} opts.store - The store instance (Task 3).
 * @param {() => boolean} opts.getHideDuplicates - Current hide-duplicates setting.
 * @returns {{render: () => void}}
 */
export function createHistoryPanel({ root, store, getHideDuplicates }) {
  /**
   * Build a single entry row element for a record.
   * @param {{id:number, content:string, timestamp:number}} rec
   * @returns {HTMLElement}
   */
  function buildEntry(rec) {
    const el = document.createElement("div");
    el.className = "entry" + (store.isHighlighted(rec.id) ? " highlighted" : "");
    el.dataset.id = String(rec.id);

    const counter = document.createElement("span");
    counter.className = "counter";
    counter.textContent = String(store.countFor(rec.content));

    const content = document.createElement("span");
    content.className = "content";
    content.textContent = rec.content;

    const ts = document.createElement("span");
    ts.className = "timestamp";
    ts.textContent = formatTimestamp(rec.timestamp);

    const trash = document.createElement("button");
    trash.className = "trash";
    trash.setAttribute("aria-label", "Delete entry");
    trash.textContent = "🗑"; // wastebasket
    trash.addEventListener("click", (e) => {
      e.stopPropagation();
      store.deleteEntry(rec.id);
    });

    attachLongPress(el, () => store.toggleHighlight(rec.id));

    el.append(counter, content, ts, trash);
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
