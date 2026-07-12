/**
 * Catalog file preview overlay. Shows a fetched catalog file as formatted
 * JSON (default) or the raw response text, with JSON parse errors and
 * catalog validation errors surfaced in a red banner at the top. Rendered
 * in an overlay with the same panel styling as the options menu, stacked
 * above it.
 */
import { setIcon } from "../util/icon.js";
import { validateCatalog } from "../catalog-import.js";

/**
 * Create the preview overlay controller bound to the #preview DOM.
 * @returns {{open: (name: string, text: string) => void}}
 */
export function createPreviewOverlay() {
  const overlay = document.getElementById("preview");
  const titleEl = document.getElementById("preview-title");
  const closeBtn = document.getElementById("preview-close");
  const errorEl = document.getElementById("preview-error");
  const formattedCb = document.getElementById("preview-formatted");
  const contentEl = document.getElementById("preview-content");

  setIcon(closeBtn, "x");

  /** @type {string} Raw response text of the previewed file. */
  let rawText = "";
  /** @type {*} Parsed JSON value; undefined when rawText is not valid JSON. */
  let parsed;
  /** @type {string|null} Error banner text, or null when the file is clean. */
  let errorText = null;

  /**
   * Render the error banner and the content area according to the current
   * state and the "Formatted" checkbox. Formatted display requires parsed
   * JSON; otherwise the raw text is shown.
   */
  function render() {
    errorEl.textContent = errorText ?? "";
    errorEl.hidden = errorText === null;
    const formatted = formattedCb.checked && parsed !== undefined;
    contentEl.textContent = formatted
      ? JSON.stringify(parsed, null, 2)
      : rawText;
  }

  /**
   * Open the overlay for one file: parse and validate the text, then show
   * it (formatted by default).
   * @param {string} name - The file name, used as the overlay title.
   * @param {string} text - The raw response body.
   */
  function open(name, text) {
    titleEl.textContent = name;
    rawText = text;
    parsed = undefined;
    errorText = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      errorText = `Parse error: ${err.message}`;
    }
    if (parsed !== undefined) {
      try {
        validateCatalog(parsed);
      } catch (err) {
        errorText = `Validation error: ${err.message}`;
      }
    }
    formattedCb.checked = true;
    render();
    overlay.hidden = false;
  }

  /** Close the overlay. */
  function close() {
    overlay.hidden = true;
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  formattedCb.addEventListener("change", render);

  return { open };
}
