/**
 * Minimal snackbar notifications. A single fixed element near the bottom of
 * the screen shows one message at a time; a new message replaces the current
 * one. Success toasts auto-dismiss after 3.5 s, error toasts after 6 s.
 */

let toastEl = null;
let hideTimer = 0;

/**
 * Show a toast message. Creates the toast element on first use.
 * @param {string} message - The text to display.
 * @param {{error?: boolean}} [opts] - Set error to true for error styling
 *   and a longer display time.
 */
export function showToast(message, { error = false } = {}) {
  if (toastEl === null) {
    toastEl = document.createElement("div");
    toastEl.id = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.toggle("toast-error", error);
  toastEl.classList.add("toast-visible");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(
    () => toastEl.classList.remove("toast-visible"),
    error ? 6000 : 3500,
  );
}
